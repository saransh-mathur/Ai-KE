export type AnswerBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; label?: string; text: string };

/**
 * Splits a grounded AI answer into structured paragraphs and labeled bullet points
 * so the UI can render clean typographic lists instead of raw pre-wrapped text.
 */
export function parseGroundedAnswerBlocks(rawText: string): AnswerBlock[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const blocks: AnswerBlock[] = [];
  for (const line of lines) {
    const bulletMatch = line.match(/^(?:[•\-*]|\d+\.)\s+(.+)$/);
    if (bulletMatch) {
      const body = bulletMatch[1].trim();
      const labelMatch = body.match(/^([A-Za-z0-9][A-Za-z0-9 &/()-]{1,42}):\s+(.+)$/);
      if (labelMatch) {
        blocks.push({
          kind: 'bullet',
          label: labelMatch[1].trim(),
          text: labelMatch[2].trim(),
        });
      } else {
        blocks.push({ kind: 'bullet', text: body });
      }
    } else {
      blocks.push({ kind: 'paragraph', text: line });
    }
  }

  return blocks;
}

export type CodeTokenKind =
  | 'keyword'
  | 'type'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator'
  | 'plain';

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
}

const SQL_KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'FULL',
  'CROSS',
  'ON',
  'AS',
  'WITH',
  'CREATE',
  'TABLE',
  'EXTENSION',
  'TYPE',
  'ENUM',
  'INDEX',
  'USING',
  'IF',
  'NOT',
  'EXISTS',
  'PRIMARY',
  'KEY',
  'FOREIGN',
  'REFERENCES',
  'DEFAULT',
  'NULL',
  'UNIQUE',
  'CHECK',
  'CONSTRAINT',
  'ON',
  'DELETE',
  'CASCADE',
  'SET',
  'ORDER',
  'BY',
  'GROUP',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'ASC',
  'DESC',
  'AND',
  'OR',
  'IN',
  'IS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'COALESCE',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'ROW_NUMBER',
  'OVER',
  'PARTITION',
  'DISTINCT',
  'UNION',
  'ALL',
  'EXPLAIN',
  'ANALYZE',
  'VALUES',
  'FILTER',
  'CAST',
  'TRUE',
  'FALSE',
]);

const SQL_TYPES = new Set([
  'UUID',
  'VARCHAR',
  'TEXT',
  'INT',
  'INTEGER',
  'BIGINT',
  'NUMERIC',
  'BOOLEAN',
  'JSONB',
  'JSON',
  'TIMESTAMPTZ',
  'TIMESTAMP',
  'VECTOR',
  'HNSW',
  'GIN',
  'BTREE',
  'FLOAT',
  'DOUBLE',
]);

const PYTHON_KEYWORDS = new Set([
  'from',
  'import',
  'class',
  'def',
  'async',
  'await',
  'return',
  'if',
  'else',
  'elif',
  'for',
  'in',
  'not',
  'and',
  'or',
  'None',
  'True',
  'False',
  'with',
  'as',
  'pass',
]);

const PYTHON_TYPES = new Set([
  'Mapped',
  'DeclarativeBase',
  'UUID',
  'String',
  'Text',
  'Integer',
  'DateTime',
  'ForeignKey',
  'Index',
  'JSONB',
  'Vector',
  'Optional',
  'List',
  'dict',
  'str',
  'int',
  'datetime',
  'uuid',
]);

/**
 * Lightweight deterministic tokenizer for SQL and Python lines.
 * Preserves exact character text so overlaid editors maintain identical glyph geometry.
 */
export function tokenizeCodeLine(line: string, language: 'sql' | 'python'): CodeToken[] {
  if (!line) return [];

  const tokens: CodeToken[] = [];
  let i = 0;
  const len = line.length;

  const pushToken = (kind: CodeTokenKind, text: string) => {
    if (!text) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.kind === kind) {
      prev.text += text;
    } else {
      tokens.push({ kind, text });
    }
  };

  while (i < len) {
    const ch = line[i];

    // Comments: -- for SQL, # for Python
    if (language === 'sql' && ch === '-' && line[i + 1] === '-') {
      pushToken('comment', line.slice(i));
      break;
    }
    if (language === 'python' && ch === '#') {
      pushToken('comment', line.slice(i));
      break;
    }

    // String literals ('...' or "...")
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < len) {
        if (line[j] === '\\' && j + 1 < len) {
          j += 2;
          continue;
        }
        if (line[j] === quote) {
          if (language === 'sql' && line[j + 1] === quote) {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      pushToken('string', line.slice(i, j));
      i = j;
      continue;
    }

    // Numeric literals (only when not part of an identifier)
    if (/[0-9]/.test(ch) && (i === 0 || !/[A-Za-z0-9_]/.test(line[i - 1]))) {
      let j = i + 1;
      while (j < len && /[0-9._]/.test(line[j])) j++;
      pushToken('number', line.slice(i, j));
      i = j;
      continue;
    }

    // Identifiers / keywords / types
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[A-Za-z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (language === 'sql') {
        const upper = word.toUpperCase();
        if (SQL_KEYWORDS.has(upper)) {
          pushToken('keyword', word);
        } else if (SQL_TYPES.has(upper)) {
          pushToken('type', word);
        } else {
          pushToken('plain', word);
        }
      } else {
        if (PYTHON_KEYWORDS.has(word)) {
          pushToken('keyword', word);
        } else if (PYTHON_TYPES.has(word)) {
          pushToken('type', word);
        } else {
          pushToken('plain', word);
        }
      }
      i = j;
      continue;
    }

    // PostgreSQL JSONB / vector / cast operators
    if (
      (ch === ':' && line[i + 1] === ':') ||
      (ch === '-' && line[i + 1] === '>') ||
      (ch === '<' && line[i + 1] === '=' && line[i + 2] === '>')
    ) {
      const opLen = ch === '<' ? 3 : 2;
      pushToken('operator', line.slice(i, i + opLen));
      i += opLen;
      continue;
    }

    pushToken('plain', ch);
    i++;
  }

  return tokens;
}

export interface CodeSectionAnchor {
  id: string;
  label: string;
  line: number; // 1-indexed
}

/**
 * Extracts navigable section anchors from SQL DDL, RRF CTE SQL, or SQLAlchemy Python models.
 */
export function extractCodeSectionAnchors(
  code: string,
  kind: 'ddl' | 'rrf' | 'orm'
): CodeSectionAnchor[] {
  const lines = code.split(/\r?\n/);
  const anchors: CodeSectionAnchor[] = [];
  const seen = new Set<string>();

  const add = (id: string, label: string, lineIndex: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    anchors.push({ id, label, line: lineIndex + 1 });
  };

  if (kind === 'ddl') {
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (/^--\s*1\.\s*Enable/i.test(trimmed) || /^CREATE EXTENSION/i.test(trimmed)) {
        add('extensions', 'Extensions', idx);
      } else if (/^--\s*2\.\s*Enumerated/i.test(trimmed) || /^CREATE TYPE/i.test(trimmed)) {
        add('enums', 'Enums', idx);
      } else if (/^CREATE TABLE IF NOT EXISTS\s+vendors\b/i.test(trimmed) || /^--\s*3\.\s*Vendors/i.test(trimmed)) {
        add('tables', 'Tables', idx);
      } else if (/^CREATE TABLE IF NOT EXISTS\s+knowledge_chunks\b/i.test(trimmed) || /knowledge_chunks/i.test(trimmed) && /^--\s*\d+\./.test(trimmed)) {
        add('vectors', 'Vector Chunks', idx);
      } else if (/USING\s+hnsw/i.test(trimmed) || /HNSW/i.test(trimmed) && /^--/.test(trimmed) && idx > 15) {
        add('hnsw', 'HNSW Indexes', idx);
      }
    });
  } else if (kind === 'rrf') {
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (/^WITH\s+filtered_entities/i.test(trimmed) || /filtered_entities\s+AS/i.test(trimmed)) {
        add('pre-filter', 'Pre-Filter CTE', idx);
      } else if (/vector_search\s+AS/i.test(trimmed)) {
        add('vector', 'Vector Search', idx);
      } else if (/graph_traversal\s+AS/i.test(trimmed)) {
        add('graph', 'Graph Traversal', idx);
      } else if (/rrf_fused\s+AS/i.test(trimmed) || /SELECT[\s\S]*rrf_score/i.test(trimmed)) {
        add('rrf-score', 'RRF Fusion', idx);
      }
    });
  } else if (kind === 'orm') {
    lines.forEach((line, idx) => {
      const match = line.match(/^class\s+([A-Za-z0-9_]+)\s*\(/);
      if (match && match[1] !== 'Base') {
        add(`class-${match[1].toLowerCase()}`, match[1], idx);
      }
    });
  }

  return anchors;
}

/**
 * Live case-insensitive row filter for LiveDatabaseExplorer tables (searches scalar & JSONB values).
 */
export function filterTableRecords(
  rows: Record<string, unknown>[],
  query: string
): Record<string, unknown>[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter((row) =>
    Object.values(row).some((val) => {
      if (val === null || val === undefined) return false;
      const serialized = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return serialized.toLowerCase().includes(needle);
    })
  );
}

export interface TableSchemaColumn {
  name: string;
  type: string;
  note?: string;
}

export interface TableSchemaSummary {
  name: string;
  description: string;
  columns: TableSchemaColumn[];
  sampleSelect: string;
}

export const POSTGRES_TABLE_CATALOG: Record<string, TableSchemaSummary> = {
  vendors: {
    name: 'vendors',
    description: 'Master vendor directory with tier classification and JSONB contract metadata.',
    columns: [
      { name: 'id', type: 'text', note: 'PK' },
      { name: 'name', type: 'text' },
      { name: 'tier', type: 'text', note: "'1' | '2' | '3'" },
      { name: 'contract_status', type: 'text' },
      { name: 'metadata', type: 'jsonb', note: 'GIN indexed' },
    ],
    sampleSelect: `SELECT id, name, tier, contract_status, metadata\nFROM vendors\nORDER BY tier ASC, name ASC\nLIMIT 25;`,
  },
  assets: {
    name: 'assets',
    description: 'Enterprise IT infrastructure assets linked to vendors and business units.',
    columns: [
      { name: 'id', type: 'text', note: 'PK' },
      { name: 'vendor_id', type: 'text', note: 'FK → vendors' },
      { name: 'business_unit_id', type: 'text', note: 'FK → business_units' },
      { name: 'name', type: 'text' },
      { name: 'type', type: 'text' },
      { name: 'region', type: 'text' },
      { name: 'criticality', type: 'text' },
      { name: 'specs', type: 'jsonb', note: 'cores, ram, storage' },
    ],
    sampleSelect: `SELECT id, name, type, region, criticality, specs\nFROM assets\nORDER BY region ASC, name ASC\nLIMIT 25;`,
  },
  business_units: {
    name: 'business_units',
    description: 'Internal business divisions and financial cost centers relying on IT assets.',
    columns: [
      { name: 'id', type: 'text', note: 'PK' },
      { name: 'name', type: 'text' },
      { name: 'cost_center', type: 'text' },
      { name: 'vp_owner', type: 'text' },
    ],
    sampleSelect: `SELECT id, name, cost_center, vp_owner\nFROM business_units\nORDER BY cost_center ASC\nLIMIT 25;`,
  },
  incidents: {
    name: 'incidents',
    description: 'Operational reliability incidents tied to assets with severity and downtime minutes.',
    columns: [
      { name: 'id', type: 'text', note: 'PK' },
      { name: 'asset_id', type: 'text', note: 'FK → assets' },
      { name: 'severity', type: 'text', note: 'SEV-1 / SEV-2 / SEV-3' },
      { name: 'title', type: 'text' },
      { name: 'root_cause', type: 'text' },
      { name: 'downtime_minutes', type: 'integer' },
    ],
    sampleSelect: `SELECT id, asset_id, severity, title, downtime_minutes\nFROM incidents\nORDER BY downtime_minutes DESC\nLIMIT 25;`,
  },
  knowledge_chunks: {
    name: 'knowledge_chunks',
    description: 'Post-mortems, runbooks, and SLAs with RBAC clearance levels for hybrid retrieval.',
    columns: [
      { name: 'id', type: 'text', note: 'PK' },
      { name: 'asset_id', type: 'text', note: 'FK → assets' },
      { name: 'document_title', type: 'text' },
      { name: 'doc_type', type: 'text' },
      { name: 'clearance_level', type: 'text', note: 'L1 / L2 / L3' },
      { name: 'chunk_text', type: 'text' },
    ],
    sampleSelect: `SELECT id, document_title, doc_type, clearance_level, LEFT(chunk_text, 120) AS preview\nFROM knowledge_chunks\nORDER BY clearance_level DESC\nLIMIT 25;`,
  },
  saved_queries: {
    name: 'saved_queries',
    description: 'Audit log of executed Knowledge Search queries and top RRF retrieval scores.',
    columns: [
      { name: 'id', type: 'serial', note: 'PK' },
      { name: 'query_text', type: 'text' },
      { name: 'filters_applied', type: 'jsonb' },
      { name: 'top_result_doc', type: 'text' },
      { name: 'rrf_score', type: 'real' },
      { name: 'created_at', type: 'timestamptz' },
    ],
    sampleSelect: `SELECT id, query_text, top_result_doc, rrf_score, created_at\nFROM saved_queries\nORDER BY created_at DESC\nLIMIT 25;`,
  },
};
