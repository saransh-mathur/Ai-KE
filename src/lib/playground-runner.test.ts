import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executePlaygroundScript,
  extractScriptPredicates,
  GRAPH_TRAVERSAL_TEMPLATE,
  DEFAULT_SQL_AUDIT_SCRIPT,
} from './playground-runner.ts';
import {
  INITIAL_RECENT_QUERIES,
  upsertRecentQueryHistory,
  filterRecentQueries,
  formatRelativeQueryTime,
} from './playground-history.ts';

test('extractScriptPredicates extracts tier, region, severity, and limit accurately', () => {
  const preds = extractScriptPredicates(`
    SELECT * FROM assets a
    JOIN vendors v ON a.vendor_id = v.id
    WHERE v.tier = '1' AND a.region = 'us-east-1'
    LIMIT 3;
  `);
  assert.equal(preds.tier, '1');
  assert.equal(preds.region, 'us-east-1');
  assert.equal(preds.limit, 3);
});

test('executePlaygroundScript runs SQL query and blocks destructive statements', () => {
  const okResult = executePlaygroundScript(DEFAULT_SQL_AUDIT_SCRIPT, 'sql');
  assert.equal(okResult.ok, true);
  assert.ok(okResult.rowCount > 0);
  assert.ok(okResult.columns.includes('vendor_name'));

  const blocked = executePlaygroundScript('DROP TABLE vendors;', 'sql');
  assert.equal(blocked.ok, false);
  assert.ok(blocked.error?.includes('DROP'));
});

test('executePlaygroundScript executes multi-hop graph traversal script', () => {
  const graphResult = executePlaygroundScript(GRAPH_TRAVERSAL_TEMPLATE, 'graph');
  assert.equal(graphResult.ok, true);
  assert.equal(graphResult.scriptType, 'graph');
  assert.ok(graphResult.rowCount >= 1);
  assert.ok(graphResult.graphPaths && graphResult.graphPaths.length >= 1);
  assert.equal(graphResult.graphPaths[0].region, 'us-east-1');
});

test('upsertRecentQueryHistory deduplicates matching scripts and moves re-run query to top', () => {
  const initial = [...INITIAL_RECENT_QUERIES];
  const lastItem = initial[initial.length - 1];

  const updated = upsertRecentQueryHistory(initial, {
    title: lastItem.title,
    scriptType: lastItem.scriptType,
    script: lastItem.script,
    executedAt: '2026-11-15T22:00:00.000Z',
    durationMs: 3,
    rowCount: 1,
    status: 'success',
    summary: 'Re-executed',
  });

  assert.equal(updated.length, initial.length);
  assert.equal(updated[0].title, lastItem.title);
  assert.equal(updated[0].summary, 'Re-executed');
});

test('filterRecentQueries filters by scriptType and search term', () => {
  const sqlOnly = filterRecentQueries(INITIAL_RECENT_QUERIES, 'sql', '');
  assert.ok(sqlOnly.every((q) => q.scriptType === 'sql'));

  const westMatches = filterRecentQueries(INITIAL_RECENT_QUERIES, 'all', 'spine');
  assert.equal(westMatches.length, 1);
  assert.equal(westMatches[0].scriptType, 'graph');
});

test('formatRelativeQueryTime formats elapsed times cleanly', () => {
  const now = Date.parse('2026-11-15T22:00:00.000Z');
  assert.equal(formatRelativeQueryTime('2026-11-15T21:59:45.000Z', now), 'Just now');
  assert.equal(formatRelativeQueryTime('2026-11-15T21:45:00.000Z', now), '15m ago');
  assert.equal(formatRelativeQueryTime('2026-11-15T19:00:00.000Z', now), '3h ago');
});
