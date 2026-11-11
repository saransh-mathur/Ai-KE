import test from 'node:test';
import assert from 'node:assert/strict';
import { generateArchitectureReport, ArchitectureSubTab } from './architecture-reports.ts';

test('generateArchitectureReport generates valid snapshot for blueprint sub-tab', () => {
  const report = generateArchitectureReport('blueprint');

  assert.equal(report.reportType, 'ENTERPRISE_ARCHITECTURE_SNAPSHOT');
  assert.equal(report.activeSubTab, 'blueprint');
  assert.equal(report.version, '1.0.0');
  assert.ok(report.targetFilename.includes('blueprint'));
  assert.ok(report.targetFilename.endsWith('.json'));
  assert.equal(report.systemOverview.vectorDimension, 768);
  assert.equal(report.systemOverview.rankingAlgorithm, 'Reciprocal Rank Fusion (RRF, k=60)');

  const payload = report.payload as { layers: any[]; queryLifecycle: string[] };
  assert.ok(Array.isArray(payload.layers));
  assert.equal(payload.layers.length, 4, 'Must define all 4 architectural layers');
  assert.equal(payload.layers[0].name, 'Relational & Metadata Layer');
  assert.equal(payload.layers[1].name, 'Vector & Semantic Retrieval Layer');
  assert.equal(payload.layers[2].name, 'Graph & Relationship Layer');
  assert.equal(payload.layers[3].name, 'Agentic Orchestration Layer');
  assert.ok(payload.queryLifecycle.length >= 4);
});

test('generateArchitectureReport generates valid snapshot for schema sub-tab', () => {
  const report = generateArchitectureReport('schema');

  assert.equal(report.activeSubTab, 'schema');
  assert.ok(report.targetFilename.includes('schema'));
  assert.ok(report.targetFilename.endsWith('.json'));

  const payload = report.payload as { databaseConfig: any; tables: any[]; rawSqlDdl: string };
  assert.equal(payload.databaseConfig.engine, 'PostgreSQL 16+');
  assert.equal(payload.databaseConfig.vectorIndexConfig.indexType, 'HNSW');
  assert.ok(Array.isArray(payload.tables));
  assert.ok(payload.tables.some((t: any) => t.tableName === 'vendors'));
  assert.ok(payload.tables.some((t: any) => t.tableName === 'knowledge_chunks'));
  assert.ok(payload.rawSqlDdl.includes('CREATE TABLE IF NOT EXISTS vendors'));
  assert.ok(payload.rawSqlDdl.includes('vector(768)'));
});

test('generateArchitectureReport generates valid snapshot for graph sub-tab', () => {
  const report = generateArchitectureReport('graph');

  assert.equal(report.activeSubTab, 'graph');
  assert.ok(report.targetFilename.includes('graph'));
  assert.ok(report.targetFilename.endsWith('.json'));

  const payload = report.payload as { graphSchema: any; entityCounts: any; sampleMultiHopChain: any };
  assert.equal(payload.graphSchema.nodeTypes.length, 4);
  assert.equal(payload.graphSchema.edgeRelationships.length, 3);
  assert.ok(payload.entityCounts.vendors > 0);
  assert.ok(payload.entityCounts.assets > 0);
  assert.ok(payload.sampleMultiHopChain.hops.length >= 4);
  assert.ok(payload.sampleMultiHopChain.whyGraphIsRequired.length > 20);
});

test('generateArchitectureReport generates valid snapshot for code sub-tab', () => {
  const report = generateArchitectureReport('code');

  assert.equal(report.activeSubTab, 'code');
  assert.ok(report.targetFilename.includes('code'));
  assert.ok(report.targetFilename.endsWith('.json'));

  const payload = report.payload as { sourceFiles: any[]; runtimeDependencies: any };
  assert.equal(payload.sourceFiles.length, 4);
  assert.ok(payload.sourceFiles.some((f: any) => f.filename === 'api/query_router.py'));
  assert.ok(payload.sourceFiles.some((f: any) => f.filename === 'sql/hybrid_retrieval.sql'));
  assert.ok(payload.runtimeDependencies.python.includes('fastapi>=0.110.0'));
});
