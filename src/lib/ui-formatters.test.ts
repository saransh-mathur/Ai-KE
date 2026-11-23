import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGroundedAnswerBlocks,
  tokenizeCodeLine,
  extractCodeSectionAnchors,
  filterTableRecords,
  POSTGRES_TABLE_CATALOG,
} from './ui-formatters';
import {
  PRODUCTION_SQL_DDL,
  PRODUCTION_RETRIEVAL_SQL,
  PRODUCTION_SQLALCHEMY_MODELS,
} from './architecture-data';

test('parseGroundedAnswerBlocks splits lead paragraph and labeled bullet points cleanly', () => {
  const sample = `The primary affected asset in us-east-1 is "aurora-pg-payments-prod".

• Incident Root Cause: Replication lag spike during rollout.
• Business Unit Impact: Payment Processing relies directly on this asset.
• Plain bullet without colon`;

  const blocks = parseGroundedAnswerBlocks(sample);
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks[0], {
    kind: 'paragraph',
    text: 'The primary affected asset in us-east-1 is "aurora-pg-payments-prod".',
  });
  assert.deepEqual(blocks[1], {
    kind: 'bullet',
    label: 'Incident Root Cause',
    text: 'Replication lag spike during rollout.',
  });
  assert.deepEqual(blocks[2], {
    kind: 'bullet',
    label: 'Business Unit Impact',
    text: 'Payment Processing relies directly on this asset.',
  });
  assert.deepEqual(blocks[3], {
    kind: 'bullet',
    text: 'Plain bullet without colon',
  });
});

test('tokenizeCodeLine highlights SQL keywords, strings, numbers, and comments without dropping characters', () => {
  const line = `SELECT v.name, 42, 'us-east-1' FROM vendors v -- active tier`;
  const tokens = tokenizeCodeLine(line, 'sql');
  assert.equal(tokens.map((t) => t.text).join(''), line);
  assert.ok(tokens.some((t) => t.kind === 'keyword' && t.text === 'SELECT'));
  assert.ok(tokens.some((t) => t.kind === 'number' && t.text === '42'));
  assert.ok(tokens.some((t) => t.kind === 'string' && t.text === `'us-east-1'`));
  assert.ok(tokens.some((t) => t.kind === 'comment' && t.text === '-- active tier'));
});

test('tokenizeCodeLine highlights Python keywords and types while preserving exact text', () => {
  const line = `class Vendor(Base): # SQLAlchemy model`;
  const tokens = tokenizeCodeLine(line, 'python');
  assert.equal(tokens.map((t) => t.text).join(''), line);
  assert.ok(tokens.some((t) => t.kind === 'keyword' && t.text === 'class'));
  assert.ok(tokens.some((t) => t.kind === 'comment' && t.text === '# SQLAlchemy model'));
});

test('extractCodeSectionAnchors finds navigable anchors across DDL, RRF SQL, and ORM models', () => {
  const ddlAnchors = extractCodeSectionAnchors(PRODUCTION_SQL_DDL, 'ddl');
  assert.ok(ddlAnchors.some((a) => a.id === 'extensions' && a.line >= 1));
  assert.ok(ddlAnchors.some((a) => a.id === 'enums'));
  assert.ok(ddlAnchors.some((a) => a.id === 'tables'));
  assert.ok(ddlAnchors.some((a) => a.id === 'hnsw'));

  const rrfAnchors = extractCodeSectionAnchors(PRODUCTION_RETRIEVAL_SQL, 'rrf');
  assert.ok(rrfAnchors.length >= 2);

  const ormAnchors = extractCodeSectionAnchors(PRODUCTION_SQLALCHEMY_MODELS, 'orm');
  assert.ok(ormAnchors.some((a) => a.label === 'Vendor'));
});

test('filterTableRecords filters scalar fields and JSONB objects case-insensitively', () => {
  const rows = [
    { id: 'v-1', name: 'Amazon Web Services', metadata: { region: 'us-east-1', sla: '99.99%' } },
    { id: 'v-2', name: 'Pure Storage', metadata: { hardware: 'NVMe FlashBlade' } },
  ];

  assert.equal(filterTableRecords(rows, '').length, 2);
  assert.equal(filterTableRecords(rows, 'flashblade').length, 1);
  assert.equal(filterTableRecords(rows, 'US-EAST-1')[0].id, 'v-1');
  assert.equal(filterTableRecords(rows, 'nonexistent').length, 0);
});

test('POSTGRES_TABLE_CATALOG covers all 6 core database tables with sample SELECT queries', () => {
  const expectedTables = [
    'vendors',
    'assets',
    'business_units',
    'incidents',
    'knowledge_chunks',
    'saved_queries',
  ];
  for (const tbl of expectedTables) {
    assert.ok(POSTGRES_TABLE_CATALOG[tbl], `Missing catalog entry for ${tbl}`);
    assert.ok(POSTGRES_TABLE_CATALOG[tbl].columns.length >= 4);
    assert.match(POSTGRES_TABLE_CATALOG[tbl].sampleSelect, new RegExp(`FROM\\s+${tbl}\\b`, 'i'));
  }
});
