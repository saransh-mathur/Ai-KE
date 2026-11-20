import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateReadOnlySqlQuery,
  formatRowsAsCsv,
  detectChartableMetrics,
  upsertSqlHistory,
  removeSqlHistoryItem,
  filterSqlHistory,
  loadSqlHistory,
  saveSqlHistory,
  analyzeSqlComplexity,
  buildSqlExplanationPayload,
  normalizeSqlExplanation,
  SQL_HISTORY_MAX_ITEMS,
  StorageLike,
} from './sql-runner.ts';

test('validateReadOnlySqlQuery allows SELECT, CTE WITH, and EXPLAIN statements with comments and trailing semicolon', () => {
  const sel = validateReadOnlySqlQuery('  -- fetch vendors\n  SELECT id, name FROM vendors WHERE tier = \'1\'; ');
  assert.equal(sel.valid, true);
  assert.equal(sel.normalizedSql.endsWith(';'), false);

  const cte = validateReadOnlySqlQuery(`
    WITH top_assets AS (SELECT id, vendor_id FROM assets)
    SELECT * FROM top_assets;
  `);
  assert.equal(cte.valid, true);

  const explain = validateReadOnlySqlQuery('EXPLAIN SELECT * FROM incidents');
  assert.equal(explain.valid, true);
});

test('validateReadOnlySqlQuery allows keywords like DELETE or DROP inside string literals safely', () => {
  const res = validateReadOnlySqlQuery("SELECT * FROM knowledge_chunks WHERE chunk_text NOT LIKE '%DROP TABLE%';");
  assert.equal(res.valid, true);
});

test('validateReadOnlySqlQuery blocks mutating statements and stacked multi-statement SQL', () => {
  const dropRes = validateReadOnlySqlQuery('DROP TABLE vendors;');
  assert.equal(dropRes.valid, false);
  assert.match(dropRes.error || '', /read-only/i);

  const cteDelete = validateReadOnlySqlQuery('WITH x AS (SELECT 1) DELETE FROM vendors;');
  assert.equal(cteDelete.valid, false);
  assert.match(cteDelete.error || '', /DELETE/);

  const stacked = validateReadOnlySqlQuery('SELECT * FROM vendors; DROP TABLE assets;');
  assert.equal(stacked.valid, false);
  assert.match(stacked.error || '', /Multiple SQL statements/i);
});

test('formatRowsAsCsv escapes commas, quotes, and JSON objects cleanly', () => {
  const csv = formatRowsAsCsv(
    ['id', 'name', 'meta'],
    [
      { id: 'ven-001', name: 'Snowflake, Inc.', meta: { tier: 1 } },
      { id: 'ven-002', name: 'AWS "Cloud"', meta: null },
    ]
  );

  const lines = csv.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'id,name,meta');
  assert.equal(lines[1], 'ven-001,"Snowflake, Inc.","{""tier"":1}"');
  assert.equal(lines[2], 'ven-002,"AWS ""Cloud""",');
});

test('detectChartableMetrics identifies categorical label and numeric metric columns', () => {
  const detected = detectChartableMetrics(
    ['severity', 'incident_count', 'avg_downtime_min'],
    [
      { severity: 'SEV-1', incident_count: 2, avg_downtime_min: '45.5' },
      { severity: 'SEV-2', incident_count: 3, avg_downtime_min: '90.0' },
    ]
  );

  assert.deepEqual(detected, { labelColumn: 'severity', valueColumn: 'incident_count' });
  assert.equal(detectChartableMetrics(['id', 'name'], [{ id: 'a', name: 'b' }]), null);
});

test('upsertSqlHistory deduplicates identical SQL, promotes most recent, and caps strictly at 10 queries', () => {
  let history = upsertSqlHistory([], { sql: 'SELECT * FROM vendors', executedAt: '10:00', rowCount: 5, executionTimeMs: 4 });
  for (let i = 1; i <= 11; i++) {
    history = upsertSqlHistory(history, {
      sql: `SELECT ${i} AS num`,
      executedAt: `10:0${i}`,
      rowCount: 1,
      executionTimeMs: i,
    });
  }

  assert.equal(SQL_HISTORY_MAX_ITEMS, 10);
  assert.equal(history.length, 10);
  assert.equal(history[0].sql, 'SELECT 11 AS num');

  // Re-running an existing entry promotes it to top without exceeding 10
  history = upsertSqlHistory(history, { sql: 'SELECT 5 AS num', executedAt: '10:20', rowCount: 1, executionTimeMs: 2 });
  assert.equal(history.length, 10);
  assert.equal(history[0].sql, 'SELECT 5 AS num');
});

test('filterSqlHistory and storage helpers filter and persist up to 10 history entries cleanly', () => {
  const map = new Map<string, string>();
  const mockStorage: StorageLike = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };

  let items = upsertSqlHistory([], { sql: 'SELECT * FROM vendors', executedAt: '10:00', rowCount: 5, executionTimeMs: 4.1 });
  items = upsertSqlHistory(items, { sql: 'SELECT * FROM incidents', executedAt: '10:01', rowCount: 6, executionTimeMs: 5.2 });
  saveSqlHistory(mockStorage, items);

  const loaded = loadSqlHistory(mockStorage);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].sql, 'SELECT * FROM incidents');

  const filtered = filterSqlHistory(loaded, 'vendors');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].sql, 'SELECT * FROM vendors');

  const afterRemove = removeSqlHistoryItem(loaded, loaded[0].id);
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].sql, 'SELECT * FROM vendors');
  saveSqlHistory(mockStorage, afterRemove);
  assert.equal(loadSqlHistory(mockStorage).length, 1);
});

test('analyzeSqlComplexity detects joins, CTEs, aggregations, and JSONB traversal accurately', () => {
  const multiJoin = analyzeSqlComplexity(`
    SELECT v.name, SUM(i.downtime_minutes)
    FROM assets a
    JOIN vendors v ON a.vendor_id = v.id
    LEFT JOIN incidents i ON i.asset_id = a.id
    GROUP BY v.name;
  `);
  assert.equal(multiJoin.tier, 'complex');
  assert.equal(multiJoin.features.includes('Multi-Table JOIN'), true);
  assert.equal(multiJoin.features.includes('Aggregation'), true);

  const jsonb = analyzeSqlComplexity(`SELECT name, specs->>'cores' AS cores FROM assets;`);
  assert.equal(jsonb.tier, 'analytical');
  assert.deepEqual(jsonb.features, ['JSONB Traversal']);

  const simple = analyzeSqlComplexity(`SELECT id, name FROM vendors;`);
  assert.equal(simple.tier, 'standard');
  assert.deepEqual(simple.features, []);
});

test('buildSqlExplanationPayload caps sample rows and clips oversized cells cleanly', () => {
  const manyRows = Array.from({ length: 40 }, (_, i) => ({
    id: `row-${i}`,
    notes: 'x'.repeat(400),
  }));

  const payload = buildSqlExplanationPayload({
    sql: 'SELECT id, notes FROM logs',
    columns: ['id', 'notes'],
    rows: manyRows,
    totalRows: 40,
    maxSampleRows: 10,
  });

  assert.equal(payload.sampledRowsCount, 10);
  assert.equal(payload.totalRows, 40);
  assert.equal(payload.truncatedForPrompt, true);
  assert.equal(String(payload.sampleRows[0].notes).length, 283);
});

test('normalizeSqlExplanation parses fenced or plain JSON into clean typed fields', () => {
  const parsed = normalizeSqlExplanation(`\`\`\`json
  {
    "executiveSummary": "Shows 3 severity tiers totaling 371 minutes.",
    "queryBreakdown": "Aggregates incidents by severity.",
    "keyInsights": ["SEV-2 caused 242m downtime", "SEV-1 had 3 events"],
    "anomaliesOrNextSteps": "Inspect SEV-1 AWS events next."
  }
  \`\`\``);

  assert.equal(parsed.executiveSummary, 'Shows 3 severity tiers totaling 371 minutes.');
  assert.equal(parsed.queryBreakdown, 'Aggregates incidents by severity.');
  assert.deepEqual(parsed.keyInsights, ['SEV-2 caused 242m downtime', 'SEV-1 had 3 events']);
  assert.equal(parsed.anomaliesOrNextSteps, 'Inspect SEV-1 AWS events next.');
});
