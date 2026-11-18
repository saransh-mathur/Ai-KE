import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnterpriseKnowledgeGraph,
  findMultiHopPath,
} from './knowledge-graph.ts';

test('buildEnterpriseKnowledgeGraph constructs connected entities across vendors, assets, BUs, and incidents', () => {
  const graph = buildEnterpriseKnowledgeGraph({ userClearance: 'L3_RESTRICTED' });

  const vendorNodes = graph.nodes.filter((n) => n.kind === 'vendor');
  const assetNodes = graph.nodes.filter((n) => n.kind === 'asset');
  const buNodes = graph.nodes.filter((n) => n.kind === 'business_unit');
  const incidentNodes = graph.nodes.filter((n) => n.kind === 'incident');

  assert.ok(vendorNodes.length >= 4, 'Must include connected vendors');
  assert.equal(assetNodes.length, 6, 'Must include all 6 enterprise assets');
  assert.equal(buNodes.length, 4, 'Must include all 4 business units');
  assert.equal(incidentNodes.length, 4, 'L3_RESTRICTED user must see all 4 incidents');
  assert.ok(graph.edges.length >= 12, 'Must include relational edges linking assets');
});

test('buildEnterpriseKnowledgeGraph enforces RBAC clearance filtering on incident nodes', () => {
  const l1Graph = buildEnterpriseKnowledgeGraph({ userClearance: 'L1_PUBLIC' });
  const l1Incidents = l1Graph.nodes.filter((n) => n.kind === 'incident');

  assert.equal(
    l1Incidents.some((n) => n.entityId === 'inc-9021'),
    false,
    'L1_PUBLIC user must not see L3_RESTRICTED SEV-1 incident node'
  );
  assert.equal(
    l1Incidents.some((n) => n.entityId === 'inc-9905'),
    true,
    'L1_PUBLIC user should still see L1_PUBLIC incident node'
  );
});

test('findMultiHopPath discovers multi-hop traversal paths between assets', () => {
  const graph = buildEnterpriseKnowledgeGraph({
    userClearance: 'L3_RESTRICTED',
    sourceAssetId: 'ast-san-01',
    targetAssetId: 'ast-sw-01',
  });

  assert.equal(graph.mode, 'asset_to_asset');
  assert.equal(graph.activePath.found, true, 'Pure Storage FlashBlade and Cisco Spine must connect across graph hops');
  assert.ok(graph.activePath.hops >= 4, 'Path from ast-san-01 to ast-sw-01 spans multiple relational hops');
  assert.equal(graph.activePath.nodeIds[0], 'asset:ast-san-01');
  assert.equal(graph.activePath.nodeIds[graph.activePath.nodeIds.length - 1], 'asset:ast-sw-01');

  const highlightedEdges = graph.edges.filter((e) => e.isOnActivePath);
  assert.equal(highlightedEdges.length, graph.activePath.hops);
});

test('findMultiHopPath handles direct 2-hop shared vendor or BU paths cleanly', () => {
  const directGraph = buildEnterpriseKnowledgeGraph({
    userClearance: 'L3_RESTRICTED',
    sourceAssetId: 'ast-rds-01',
    targetAssetId: 'ast-srv-alpha',
  });

  assert.equal(directGraph.activePath.found, true);
  assert.equal(directGraph.activePath.hops, 2, 'Aurora RDS and SRV-Alpha share AWS vendor (2 hops)');
  assert.ok(directGraph.activePath.nodeIds.includes('vendor:ven-002'));

  const missingPath = findMultiHopPath(
    directGraph.nodes,
    directGraph.edges,
    'asset:ast-rds-01',
    'asset:nonexistent'
  );
  assert.equal(missingPath.found, false);
  assert.equal(missingPath.hops, 0);
});
