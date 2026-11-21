export interface SqlValidationResult {
  valid: boolean;
  normalizedSql: string;
  error?: string;
}

export interface SqlPreset {
  id: string;
  label: string;
  description: string;
  sql: string;
}

export interface SqlHistoryItem {
  id: string;
  sql: string;
  executedAt: string;
  rowCount: number;
  executionTimeMs: number;
}

export const SQL_QUERY_PRESETS: SqlPreset[] = [
  {
    id: 'multi-hop-chain',
    label: '4-Hop Enterprise Graph JOIN',
    description: 'Joins vendors, assets, business_units, and incidents in a single relational query.',
    sql: `SELECT
  v.name AS vendor,
  v.tier,
  a.name AS asset,
  a.region,
  bu.name AS business_unit,
  COALESCE(i.severity, 'NONE') AS severity,
  COALESCE(i.downtime_minutes, 0) AS downtime_min
FROM assets a
JOIN vendors v ON a.vendor_id = v.id
JOIN business_units bu ON a.business_unit_id = bu.id
LEFT JOIN incidents i ON i.asset_id = a.id
ORDER BY v.tier ASC, downtime_min DESC;`,
  },
  {
    id: 'asset-specs-jsonb',
    label: 'Asset Specs (JSONB)',
    description: 'Extracts structured hardware attributes from asset JSONB columns.',
    sql: `SELECT
  id,
  name,
  type,
  region,
  criticality,
  specs->>'cores' AS cores,
  specs->>'ram_gb' AS ram_gb,
  specs->>'storage_tb' AS storage_tb
FROM assets
ORDER BY region, name;`,
  },
  {
    id: 'incident-aggregation',
    label: 'Incident Downtime Summary',
    description: 'Aggregates total and average downtime grouped by severity.',
    sql: `SELECT
  severity,
  COUNT(*)::int AS incident_count,
  SUM(downtime_minutes)::int AS total_downtime_min,
  ROUND(AVG(downtime_minutes), 1) AS avg_downtime_min
FROM incidents
GROUP BY severity
ORDER BY total_downtime_min DESC;`,
  },
  {
    id: 'knowledge-rbac',
    label: 'Knowledge Chunks & RBAC',
    description: 'Inspects indexed document chunks and security clearance metadata.',
    sql: `SELECT
  kc.id,
  kc.document_title,
  kc.doc_type,
  COALESCE(kc.metadata->>'security_clearance', 'L1_PUBLIC') AS clearance,
  a.name AS asset_name,
  LENGTH(kc.chunk_text) AS char_length
FROM knowledge_chunks kc
JOIN assets a ON kc.asset_id = a.id
ORDER BY kc.id;`,
  },
  {
    id: 'pg-indexes',
    label: 'PostgreSQL Indexes',
    description: 'Lists active B-tree, GIN, and HNSW indexes in the public schema.',
    sql: `SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;`,
  },
];

const ALLOWED_LEADING_KEYWORDS = ['SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'VALUES'];

const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'GRANT',
  'REVOKE',
  'MERGE',
  'CALL',
  'COPY',
  'VACUUM',
  'REINDEX',
  'CLUSTER',
  'COMMENT',
  'LOCK',
];

/**
 * Strips single-quoted string literals and SQL comments so keyword/semicolon checks
 * do not trigger false positives inside string constants or comments.
 */
function stripCommentsAndLiterals(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment --
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' ';
      continue;
    }

    // Block comment /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }

    // Single-quoted literal '...'
    if (ch === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      out += " '' ";
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

/**
 * Validates that a user-submitted SQL query is strictly single-statement and read-only.
 */
export function validateReadOnlySqlQuery(rawSql: string): SqlValidationResult {
  if (!rawSql || !rawSql.trim()) {
    return { valid: false, normalizedSql: '', error: 'SQL query cannot be empty.' };
  }

  const trimmed = rawSql.trim();
  const stripped = stripCommentsAndLiterals(trimmed).trim();

  if (!stripped) {
    return { valid: false, normalizedSql: '', error: 'SQL query contains only comments.' };
  }

  // Allow optional single trailing semicolon; block stacked multi-statements
  const withoutTrailingSemi = stripped.replace(/;\s*$/, '');
  if (withoutTrailingSemi.includes(';')) {
    return {
      valid: false,
      normalizedSql: '',
      error: 'Multiple SQL statements are not allowed. Execute one query at a time.',
    };
  }

  const firstWordMatch = withoutTrailingSemi.match(/^\(*\s*([a-zA-Z_]+)/);
  const leadingKeyword = firstWordMatch ? firstWordMatch[1].toUpperCase() : '';

  if (!ALLOWED_LEADING_KEYWORDS.includes(leadingKeyword)) {
    return {
      valid: false,
      normalizedSql: '',
      error: `Only read-only queries (${ALLOWED_LEADING_KEYWORDS.join(', ')}) are permitted. Received "${leadingKeyword || 'unknown'}".`,
    };
  }

  // Block forbidden mutating keywords anywhere outside string literals/comments
  const upperTokens = withoutTrailingSemi.toUpperCase().split(/[^A-Z0-9_]+/).filter(Boolean);
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (upperTokens.includes(kw)) {
      return {
        valid: false,
        normalizedSql: '',
        error: `Statement blocked by read-only safety policy: keyword "${kw}" is not permitted.`,
      };
    }
  }

  // Normalize away a trailing semicolon cleanly for safe execution
  const normalizedSql = trimmed.replace(/;\s*$/, '').trim();
  return { valid: true, normalizedSql };
}

/**
 * Formats query result columns & rows into an RFC-4180 CSV string.
 */
export function formatRowsAsCsv(
  columns: string[],
  rows: Array<Record<string, unknown>>
): string {
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const raw = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (/[",\n\r]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };

  const headerLine = columns.map(escapeCell).join(',');
  const dataLines = rows.map((row) => columns.map((col) => escapeCell(row[col])).join(','));
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Formats query result columns & rows into pretty-printed JSON with deterministic column ordering.
 */
export function formatRowsAsJson(
  columns: string[],
  rows: Array<Record<string, unknown>>,
  pretty = true
): string {
  const orderedRows = rows.map((row) => {
    const ordered: Record<string, unknown> = {};
    for (const col of columns) {
      ordered[col] = row[col] === undefined ? null : row[col];
    }
    return ordered;
  });

  return JSON.stringify(orderedRows, null, pretty ? 2 : undefined);
}

/**
 * Builds a clean, descriptive download filename derived from the SQL query's primary table and timestamp.
 */
export function buildSqlExportFilename(
  sql: string,
  format: 'csv' | 'json',
  now: Date = new Date()
): string {
  const stripped = stripCommentsAndLiterals(sql || '');
  const fromMatch = stripped.match(/\bFROM\s+(?:[a-zA-Z0-9_"]+\.)?"?([a-zA-Z0-9_]+)"?/i);
  const rawSlug = fromMatch?.[1] || 'query-results';
  const safeSlug = rawSlug
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'query-results';

  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');

  return `postgres-${safeSlug}-${stamp}.${format}`;
}

/**
 * Finds the first numeric column suitable for quick bar-chart visualization of query results.
 */
export function detectChartableMetrics(
  columns: string[],
  rows: Array<Record<string, unknown>>
): { labelColumn: string; valueColumn: string } | null {
  if (columns.length < 2 || rows.length === 0) return null;

  let labelColumn: string | null = null;
  let valueColumn: string | null = null;

  for (const col of columns) {
    const sample = rows.find((r) => r[col] !== null && r[col] !== undefined)?.[col];
    if (sample === undefined) continue;

    const numericCandidate =
      typeof sample === 'number' ||
      (typeof sample === 'string' && sample.trim() !== '' && Number.isFinite(Number(sample)));

    if (numericCandidate && !valueColumn) {
      valueColumn = col;
    } else if (!numericCandidate && !labelColumn) {
      labelColumn = col;
    }
  }

  if (!labelColumn && columns.length >= 2) {
    labelColumn = columns[0] === valueColumn ? columns[1] : columns[0];
  }

  if (!labelColumn || !valueColumn || labelColumn === valueColumn) return null;
  return { labelColumn, valueColumn };
}

export const SQL_HISTORY_MAX_ITEMS = 10;
export const SQL_HISTORY_STORAGE_KEY = 'enterprise_kg_sql_query_history_v1';

export function upsertSqlHistory(
  history: SqlHistoryItem[],
  entry: Omit<SqlHistoryItem, 'id'>,
  maxItems = SQL_HISTORY_MAX_ITEMS
): SqlHistoryItem[] {
  const normalized = entry.sql.trim();
  const filtered = history.filter((item) => item.sql.trim() !== normalized);
  return [
    {
      ...entry,
      id: `sql-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sql: normalized,
    },
    ...filtered,
  ].slice(0, maxItems);
}

export function removeSqlHistoryItem(
  history: SqlHistoryItem[],
  id: string
): SqlHistoryItem[] {
  return history.filter((item) => item.id !== id);
}

export function filterSqlHistory(
  history: SqlHistoryItem[],
  searchTerm: string
): SqlHistoryItem[] {
  const q = searchTerm.trim().toLowerCase();
  if (!q) return history;
  return history.filter((item) => item.sql.toLowerCase().includes(q));
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadSqlHistory(storage?: StorageLike | null): SqlHistoryItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SQL_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SqlHistoryItem =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.sql === 'string' &&
          typeof item.executedAt === 'string' &&
          typeof item.rowCount === 'number' &&
          typeof item.executionTimeMs === 'number'
      )
      .slice(0, SQL_HISTORY_MAX_ITEMS);
  } catch {
    return [];
  }
}

export function saveSqlHistory(
  storage: StorageLike | null | undefined,
  history: SqlHistoryItem[]
): void {
  if (!storage) return;
  try {
    storage.setItem(
      SQL_HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, SQL_HISTORY_MAX_ITEMS))
    );
  } catch {
    // Ignore quota or storage restriction errors cleanly
  }
}

export interface SqlResultExplanation {
  executiveSummary: string;
  queryBreakdown: string;
  keyInsights: string[];
  anomaliesOrNextSteps: string;
}

export interface SqlComplexityProfile {
  tier: 'complex' | 'analytical' | 'standard';
  features: string[];
}

export function analyzeSqlComplexity(sql: string): SqlComplexityProfile {
  const upper = stripCommentsAndLiterals(sql).toUpperCase();
  const features: string[] = [];

  if (/\bWITH\b/.test(upper)) features.push('CTE');
  if (/\bJOIN\b/.test(upper)) features.push('Multi-Table JOIN');
  if (/\b(GROUP\s+BY|HAVING)\b/.test(upper)) features.push('Aggregation');
  if (/\bOVER\s*\(/.test(upper)) features.push('Window Function');
  if (/->>|->|#>|#>>|@>/.test(upper)) features.push('JSONB Traversal');
  if (/<=>|<->|<#>/.test(upper)) features.push('Vector Distance');

  const joinMatches = upper.match(/\bJOIN\b/g)?.length || 0;
  const isComplex = features.length >= 2 || joinMatches >= 2 || /\bWITH\b|\bOVER\s*\(/.test(upper);
  const tier: SqlComplexityProfile['tier'] = isComplex
    ? 'complex'
    : features.length === 1
      ? 'analytical'
      : 'standard';

  return { tier, features };
}

function truncateCellForPrompt(value: unknown, maxLength = 280): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }
  if (typeof value === 'object') {
    const serialized = JSON.stringify(value);
    return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...` : value;
  }
  return value;
}

export interface SqlExplanationPromptPayload {
  sql: string;
  columns: string[];
  totalRows: number;
  sampledRowsCount: number;
  truncatedForPrompt: boolean;
  complexity: SqlComplexityProfile;
  sampleRows: Array<Record<string, unknown>>;
}

export function buildSqlExplanationPayload(params: {
  sql: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  totalRows?: number;
  maxSampleRows?: number;
}): SqlExplanationPromptPayload {
  const maxRows = Math.max(1, Math.min(50, params.maxSampleRows ?? 25));
  const cleanSql = params.sql.trim();
  const safeRows = Array.isArray(params.rows) ? params.rows : [];
  const totalRows = typeof params.totalRows === 'number' && params.totalRows >= safeRows.length
    ? params.totalRows
    : safeRows.length;

  const sliced = safeRows.slice(0, maxRows);
  const sampleRows = sliced.map((row) => {
    const bounded: Record<string, unknown> = {};
    for (const col of params.columns) {
      bounded[col] = truncateCellForPrompt(row[col]);
    }
    return bounded;
  });

  return {
    sql: cleanSql,
    columns: params.columns,
    totalRows,
    sampledRowsCount: sampleRows.length,
    truncatedForPrompt: totalRows > sampleRows.length,
    complexity: analyzeSqlComplexity(cleanSql),
    sampleRows,
  };
}

export function normalizeSqlExplanation(rawText: string): SqlResultExplanation {
  const trimmed = (rawText || '').trim();
  const unwrapped = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  const parsed = JSON.parse(unwrapped) as Partial<SqlResultExplanation>;

  const executiveSummary =
    typeof parsed.executiveSummary === 'string' && parsed.executiveSummary.trim()
      ? parsed.executiveSummary.trim()
      : 'Summary unavailable for the returned result set.';

  const queryBreakdown =
    typeof parsed.queryBreakdown === 'string' && parsed.queryBreakdown.trim()
      ? parsed.queryBreakdown.trim()
      : 'Query reads relational records from PostgreSQL.';

  const keyInsights = Array.isArray(parsed.keyInsights)
    ? parsed.keyInsights
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const anomaliesOrNextSteps =
    typeof parsed.anomaliesOrNextSteps === 'string' && parsed.anomaliesOrNextSteps.trim()
      ? parsed.anomaliesOrNextSteps.trim()
      : 'No structural anomalies detected in the sampled rows.';

  return {
    executiveSummary,
    queryBreakdown,
    keyInsights,
    anomaliesOrNextSteps,
  };
}
