import {
  MOCK_VENDORS,
  MOCK_ASSETS,
  MOCK_BUSINESS_UNITS,
  MOCK_INCIDENTS,
} from './mock-data.ts';
import {
  HybridSearchResult,
  SecurityClearanceLevel,
} from './types.ts';
import { isAuthorized } from './hybrid-search.ts';

export type GraphNodeKind = 'vendor' | 'asset' | 'business_unit' | 'incident';
export type GraphEdgeRelation = 'SUPPLIES' | 'IMPACTS' | 'TIED_TO';

export interface KnowledgeGraphNode {
  id: string;
  entityId: string;
  kind: GraphNodeKind;
  label: string;
  shortLabel: string;
  subtitle: string;
  details: Record<string, string | number>;
  isPrimaryMatch: boolean;
  isOnActivePath: boolean;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: GraphEdgeRelation;
  isOnActivePath: boolean;
}

export interface PathStep {
  nodeId: string;
  label: string;
  kind: GraphNodeKind;
  viaRelation?: GraphEdgeRelation;
}

export interface MultiHopPathResult {
  found: boolean;
  hops: number;
  nodeIds: string[];
  edgeIds: string[];
  steps: PathStep[];
}

export interface EnterpriseKnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  activePath: MultiHopPathResult;
  mode: 'asset_to_asset' | 'query_chain';
}

export interface BuildGraphOptions {
  activeResults?: HybridSearchResult[];
  userClearance?: SecurityClearanceLevel;
  sourceAssetId?: string;
  targetAssetId?: string;
}

function truncateLabel(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * Finds the shortest multi-hop traversal path between any two graph nodes
 * across undirected relational edges (Vendor <-> Asset <-> Business Unit / Incident).
 */
export function findMultiHopPath(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
  startNodeId: string,
  endNodeId: string
): MultiHopPathResult {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  if (!nodeMap.has(startNodeId) || !nodeMap.has(endNodeId)) {
    return { found: false, hops: 0, nodeIds: [], edgeIds: [], steps: [] };
  }

  if (startNodeId === endNodeId) {
    const single = nodeMap.get(startNodeId)!;
    return {
      found: true,
      hops: 0,
      nodeIds: [startNodeId],
      edgeIds: [],
      steps: [{ nodeId: single.id, label: single.label, kind: single.kind }],
    };
  }

  const adjacency = new Map<string, Array<{ neighborId: string; edge: KnowledgeGraphEdge }>>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.push({ neighborId: edge.target, edge });
    adjacency.get(edge.target)?.push({ neighborId: edge.source, edge });
  }

  const visited = new Set<string>([startNodeId]);
  const parent = new Map<string, { prevNodeId: string; edge: KnowledgeGraphEdge }>();
  const queue: string[] = [startNodeId];

  let reached = false;
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === endNodeId) {
      reached = true;
      break;
    }

    const neighbors = adjacency.get(current) || [];
    for (const { neighborId, edge } of neighbors) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        parent.set(neighborId, { prevNodeId: current, edge });
        queue.push(neighborId);
      }
    }
  }

  if (!reached) {
    return { found: false, hops: 0, nodeIds: [], edgeIds: [], steps: [] };
  }

  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  const steps: PathStep[] = [];

  let cursor: string | undefined = endNodeId;
  while (cursor) {
    const node = nodeMap.get(cursor)!;
    const linkInfo = parent.get(cursor);
    nodeIds.unshift(cursor);
    steps.unshift({
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      viaRelation: linkInfo?.edge.relation,
    });
    if (linkInfo) {
      edgeIds.unshift(linkInfo.edge.id);
      cursor = linkInfo.prevNodeId;
    } else {
      cursor = undefined;
    }
  }

  return {
    found: true,
    hops: edgeIds.length,
    nodeIds,
    edgeIds,
    steps,
  };
}

/**
 * Constructs an RBAC-aware Enterprise Knowledge Graph combining Vendors, Assets,
 * Business Units, and authorized Incidents, and highlights either:
 * 1) Multi-hop traversal path between two selected assets (`asset_to_asset`), OR
 * 2) The top query result's 4-node dependency chain (`query_chain`).
 */
export function buildEnterpriseKnowledgeGraph(
  options: BuildGraphOptions = {}
): EnterpriseKnowledgeGraphData {
  const {
    activeResults = [],
    userClearance = 'L3_RESTRICTED',
    sourceAssetId,
    targetAssetId,
  } = options;

  const topResult = activeResults[0];
  const matchedAssetIds = new Set(activeResults.map((r) => r.asset.id));

  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  const addedNodeIds = new Set<string>();

  const addNode = (node: KnowledgeGraphNode) => {
    if (!addedNodeIds.has(node.id)) {
      addedNodeIds.add(node.id);
      nodes.push(node);
    }
  };

  // Build connected topology around enterprise assets
  for (const asset of MOCK_ASSETS) {
    const assetNodeId = `asset:${asset.id}`;
    const vendor = MOCK_VENDORS.find((v) => v.id === asset.vendor_id);
    const bu = MOCK_BUSINESS_UNITS.find((b) => b.id === asset.business_unit_id);

    addNode({
      id: assetNodeId,
      entityId: asset.id,
      kind: 'asset',
      label: asset.name,
      shortLabel: truncateLabel(asset.name, 20),
      subtitle: `${asset.type.replace('_', ' ')} · ${asset.region}`,
      details: {
        ID: asset.id,
        Type: asset.type,
        Region: asset.region,
        Criticality: asset.criticality,
        ...(asset.specs.cores ? { Cores: asset.specs.cores } : {}),
        ...(asset.specs.ram_gb ? { 'RAM (GB)': asset.specs.ram_gb } : {}),
        ...(asset.specs.storage_tb ? { 'Storage (TB)': asset.specs.storage_tb } : {}),
      },
      isPrimaryMatch: topResult?.asset.id === asset.id || matchedAssetIds.has(asset.id),
      isOnActivePath: false,
    });

    if (vendor) {
      const vendorNodeId = `vendor:${vendor.id}`;
      addNode({
        id: vendorNodeId,
        entityId: vendor.id,
        kind: 'vendor',
        label: vendor.name,
        shortLabel: truncateLabel(vendor.name, 18),
        subtitle: `Tier ${vendor.tier} · ${vendor.contract_status}`,
        details: {
          ID: vendor.id,
          Tier: `Tier ${vendor.tier}`,
          Status: vendor.contract_status,
          SLA: `${vendor.metadata.sla_percentage}%`,
          Category: vendor.metadata.category,
        },
        isPrimaryMatch: topResult?.vendor.id === vendor.id,
        isOnActivePath: false,
      });

      edges.push({
        id: `edge:${vendorNodeId}->${assetNodeId}`,
        source: vendorNodeId,
        target: assetNodeId,
        relation: 'SUPPLIES',
        isOnActivePath: false,
      });
    }

    if (bu) {
      const buNodeId = `bu:${bu.id}`;
      addNode({
        id: buNodeId,
        entityId: bu.id,
        kind: 'business_unit',
        label: bu.name,
        shortLabel: truncateLabel(bu.name, 18),
        subtitle: bu.cost_center,
        details: {
          ID: bu.id,
          'Cost Center': bu.cost_center,
          Lead: bu.lead,
        },
        isPrimaryMatch: topResult?.businessUnit.id === bu.id,
        isOnActivePath: false,
      });

      edges.push({
        id: `edge:${assetNodeId}->${buNodeId}`,
        source: assetNodeId,
        target: buNodeId,
        relation: 'IMPACTS',
        isOnActivePath: false,
      });
    }
  }

  // Add incidents authorized under current RBAC security clearance
  for (const incident of MOCK_INCIDENTS) {
    if (!isAuthorized(userClearance, incident.security_clearance || 'L1_PUBLIC')) {
      continue;
    }

    const assetNodeId = `asset:${incident.asset_id}`;
    if (!addedNodeIds.has(assetNodeId)) continue;

    const incidentNodeId = `incident:${incident.id}`;
    addNode({
      id: incidentNodeId,
      entityId: incident.id,
      kind: 'incident',
      label: incident.title,
      shortLabel: `${incident.severity} (${incident.id})`,
      subtitle: `${incident.severity} · ${incident.downtime_minutes}m downtime`,
      details: {
        ID: incident.id,
        Severity: incident.severity,
        Downtime: `${incident.downtime_minutes} min`,
        Clearance: incident.security_clearance || 'L1_PUBLIC',
      },
      isPrimaryMatch: topResult?.incident?.id === incident.id,
      isOnActivePath: false,
    });

    edges.push({
      id: `edge:${assetNodeId}->${incidentNodeId}`,
      source: assetNodeId,
      target: incidentNodeId,
      relation: 'TIED_TO',
      isOnActivePath: false,
    });
  }

  // Determine whether highlighting multi-hop asset-to-asset traversal or active query 4-node chain
  const useAssetToAsset =
    Boolean(sourceAssetId) &&
    Boolean(targetAssetId) &&
    sourceAssetId !== targetAssetId &&
    addedNodeIds.has(`asset:${sourceAssetId}`) &&
    addedNodeIds.has(`asset:${targetAssetId}`);

  let activePath: MultiHopPathResult;

  if (useAssetToAsset) {
    activePath = findMultiHopPath(
      nodes,
      edges,
      `asset:${sourceAssetId}`,
      `asset:${targetAssetId}`
    );
  } else {
    const focusAsset =
      (sourceAssetId && MOCK_ASSETS.find((a) => a.id === sourceAssetId)) ||
      topResult?.asset ||
      MOCK_ASSETS[0];

    const chainNodeIds: string[] = [];
    const chainEdgeIds: string[] = [];
    const steps: PathStep[] = [];

    const vendorNodeId = `vendor:${focusAsset.vendor_id}`;
    const assetNodeId = `asset:${focusAsset.id}`;
    const buNodeId = `bu:${focusAsset.business_unit_id}`;

    const vendorNode = nodes.find((n) => n.id === vendorNodeId);
    const assetNode = nodes.find((n) => n.id === assetNodeId);
    const buNode = nodes.find((n) => n.id === buNodeId);

    if (vendorNode) {
      chainNodeIds.push(vendorNode.id);
      steps.push({ nodeId: vendorNode.id, label: vendorNode.label, kind: vendorNode.kind });
    }
    if (assetNode) {
      chainNodeIds.push(assetNode.id);
      if (vendorNode) chainEdgeIds.push(`edge:${vendorNodeId}->${assetNodeId}`);
      steps.push({
        nodeId: assetNode.id,
        label: assetNode.label,
        kind: assetNode.kind,
        viaRelation: vendorNode ? 'SUPPLIES' : undefined,
      });
    }
    if (buNode) {
      chainNodeIds.push(buNode.id);
      chainEdgeIds.push(`edge:${assetNodeId}->${buNodeId}`);
      steps.push({
        nodeId: buNode.id,
        label: buNode.label,
        kind: buNode.kind,
        viaRelation: 'IMPACTS',
      });
    }

    const authorizedIncident = MOCK_INCIDENTS.find(
      (inc) =>
        inc.asset_id === focusAsset.id &&
        isAuthorized(userClearance, inc.security_clearance || 'L1_PUBLIC')
    );

    if (authorizedIncident) {
      const incidentNodeId = `incident:${authorizedIncident.id}`;
      const incidentNode = nodes.find((n) => n.id === incidentNodeId);
      if (incidentNode) {
        chainNodeIds.push(incidentNode.id);
        chainEdgeIds.push(`edge:${assetNodeId}->${incidentNodeId}`);
        steps.push({
          nodeId: incidentNode.id,
          label: incidentNode.label,
          kind: incidentNode.kind,
          viaRelation: 'TIED_TO',
        });
      }
    }

    activePath = {
      found: chainNodeIds.length > 0,
      hops: chainEdgeIds.length,
      nodeIds: chainNodeIds,
      edgeIds: chainEdgeIds,
      steps,
    };
  }

  const activeNodeSet = new Set(activePath.nodeIds);
  const activeEdgeSet = new Set(activePath.edgeIds);

  for (const node of nodes) {
    node.isOnActivePath = activeNodeSet.has(node.id);
  }
  for (const edge of edges) {
    edge.isOnActivePath = activeEdgeSet.has(edge.id);
  }

  return {
    nodes,
    edges,
    activePath,
    mode: useAssetToAsset ? 'asset_to_asset' : 'query_chain',
  };
}
