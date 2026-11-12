import { MOCK_VENDORS, MOCK_ASSETS, MOCK_BUSINESS_UNITS, MOCK_INCIDENTS, MOCK_KNOWLEDGE_CHUNKS } from './mock-data.ts';
import {
  HybridSearchResult,
  Vendor,
  Asset,
  BusinessUnit,
  Incident,
  KnowledgeChunk,
  SecurityClearanceLevel,
  RedactedDocumentNotice,
  HybridRetrievalExecutionResponse,
} from './types.ts';

export const CLEARANCE_HIERARCHY: Record<SecurityClearanceLevel, number> = {
  L1_PUBLIC: 1,
  L2_CONFIDENTIAL: 2,
  L3_RESTRICTED: 3,
};

export function isAuthorized(
  userClearance: SecurityClearanceLevel,
  requiredClearance?: SecurityClearanceLevel
): boolean {
  const req = requiredClearance || 'L1_PUBLIC';
  return CLEARANCE_HIERARCHY[userClearance] >= CLEARANCE_HIERARCHY[req];
}

export interface QueryAnalysis {
  originalQuery: string;
  extractedFilters: {
    vendorTier?: number;
    contractStatus?: string;
    region?: string;
    assetType?: string;
    severity?: string;
  };
  detectedEntities: string[];
  graphTraversalIntent: boolean;
  semanticIntentSummary: string;
}

/**
 * Reciprocal Rank Fusion (RRF) algorithm standard in modern hybrid retrieval systems.
 * RRF score = sum( 1 / (k + rank) ) across all retrieval channels.
 */
export function calculateRRFScore(vectorRank: number, graphRank: number, k: number = 60): number {
  const vScore = 1 / (k + vectorRank);
  const gScore = graphRank > 0 ? 1 / (k + graphRank) : 0;
  return Number((vScore + gScore).toFixed(6));
}

/**
 * Computes deterministic simulated cosine similarity between query keywords and knowledge chunks.
 * In production, this matches pgvector's `<=>` (cosine distance) or `<#>` (inner product).
 */
export function computeSimulatedCosineSimilarity(query: string, chunk: KnowledgeChunk): number {
  const queryTokens = query.toLowerCase().split(/[\s,.-]+/).filter(Boolean);
  const text = (chunk.chunk_text + ' ' + chunk.document_title + ' ' + chunk.metadata.tags.join(' ')).toLowerCase();

  let hits = 0;
  let totalWeight = 0;

  for (const token of queryTokens) {
    if (['what', 'which', 'our', 'the', 'and', 'for', 'with', 'from', 'have', 'say', 'about'].includes(token)) {
      continue;
    }
    totalWeight += 1;
    if (text.includes(token)) {
      hits += 1;
      // Bonus if matched tag or title
      if (chunk.metadata.tags.some(t => t.toLowerCase().includes(token))) {
        hits += 0.5;
      }
      if (chunk.document_title.toLowerCase().includes(token)) {
        hits += 0.5;
      }
    }
  }

  if (totalWeight === 0) return 0.5;
  const baseScore = Math.min(0.96, Math.max(0.35, 0.45 + (hits / totalWeight) * 0.5));
  return Number(baseScore.toFixed(4));
}

/**
 * Analyzes the natural language query to generate relational SQL filter predicates
 * and detect multi-hop relational dependencies.
 */
export function parseNaturalLanguageQuery(query: string): QueryAnalysis {
  const lower = query.toLowerCase();
  const filters: QueryAnalysis['extractedFilters'] = {};
  const detectedEntities: string[] = [];

  // Vendor Tier
  if (lower.includes('tier-1') || lower.includes('tier 1')) {
    filters.vendorTier = 1;
    detectedEntities.push('Vendor Tier: 1');
  } else if (lower.includes('tier-2') || lower.includes('tier 2')) {
    filters.vendorTier = 2;
    detectedEntities.push('Vendor Tier: 2');
  }

  // Contract Status
  if (lower.includes('active contract') || lower.includes('status active') || lower.includes('active')) {
    filters.contractStatus = 'active';
    detectedEntities.push('Contract Status: active');
  }

  // Region
  if (lower.includes('us-east-1')) {
    filters.region = 'us-east-1';
    detectedEntities.push('Region: us-east-1');
  } else if (lower.includes('us-west-2')) {
    filters.region = 'us-west-2';
    detectedEntities.push('Region: us-west-2');
  } else if (lower.includes('europe-west1') || lower.includes('europe') || lower.includes('eu-west-1')) {
    filters.region = 'europe-west1';
    detectedEntities.push('Region: europe-west1');
  }

  // Asset type
  if (lower.includes('database') || lower.includes('postgres') || lower.includes('aurora') || lower.includes('rds')) {
    filters.assetType = 'database';
    detectedEntities.push('Asset Type: database');
  } else if (lower.includes('storage') || lower.includes('flashblade') || lower.includes('san')) {
    filters.assetType = 'storage';
    detectedEntities.push('Asset Type: storage');
  } else if (lower.includes('switch') || lower.includes('network') || lower.includes('cisco')) {
    filters.assetType = 'network_switch';
    detectedEntities.push('Asset Type: network_switch');
  } else if (lower.includes('server') || lower.includes('srv-alpha') || lower.includes('cloudscale')) {
    filters.assetType = 'server';
    detectedEntities.push('Asset Type: server');
  }

  // Incident severity
  if (lower.includes('sev-1') || lower.includes('critical incident') || lower.includes('sev 1')) {
    filters.severity = 'SEV-1';
    detectedEntities.push('Incident Severity: SEV-1');
  } else if (lower.includes('sev-2') || lower.includes('severity-2')) {
    filters.severity = 'SEV-2';
    detectedEntities.push('Incident Severity: SEV-2');
  }

  const graphTraversalIntent = 
    lower.includes('impact') || 
    lower.includes('incident') || 
    lower.includes('business unit') || 
    lower.includes('root cause') ||
    lower.includes('post-mortem') ||
    lower.includes('postmortem') ||
    lower.includes('supplies') ||
    lower.includes('server');

  return {
    originalQuery: query,
    extractedFilters: filters,
    detectedEntities,
    graphTraversalIntent,
    semanticIntentSummary: `Hybrid filter: ${detectedEntities.length ? detectedEntities.join(' | ') : 'Unconstrained'}${graphTraversalIntent ? ' + Multi-Hop Graph Traversal' : ''}`,
  };
}

export interface HybridRetrievalOptions {
  applySqlFilters?: boolean;
  useGraphRank?: boolean;
  overrideRegion?: string; // 'all' | 'us-east-1' | 'us-west-2' | 'europe-west1'
  overrideTier?: string;   // 'all' | '1' | '2' | '3'
  userClearance?: SecurityClearanceLevel; // 'L1_PUBLIC' | 'L2_CONFIDENTIAL' | 'L3_RESTRICTED'
  kConstant?: number;      // RRF k factor, default 60 or tuned via RLHF
  maxResults?: number;
}

/**
 * Executes the full hybrid retrieval pipeline with RBAC vector space pre-filtering:
 * 1. Filter structured tables (vendors, assets) & security clearance
 * 2. Redact restricted documents before RRF ranking
 * 3. Traverse Graph relationships (Vendor -> Asset -> BU -> Incident)
 * 4. Calculate Vector Cosine Similarity
 * 5. Combine via Reciprocal Rank Fusion (RRF)
 */
export function executeHybridRetrievalWithRbac(
  query: string,
  analysis: QueryAnalysis,
  options: HybridRetrievalOptions = {}
): HybridRetrievalExecutionResponse {
  const {
    applySqlFilters = true,
    useGraphRank = true,
    overrideRegion,
    overrideTier,
    userClearance = 'L3_RESTRICTED',
    kConstant = 60,
    maxResults = 5,
  } = options;

  const candidates: Array<{
    chunk: KnowledgeChunk;
    asset: Asset;
    vendor: Vendor;
    businessUnit: BusinessUnit;
    incident?: Incident;
    vectorScore: number;
    graphRelevanceScore: number;
    sqlFilterMatched: boolean;
    hopPath: string[];
  }> = [];

  const redactedNotices: RedactedDocumentNotice[] = [];
  let evaluatedCount = 0;
  let graphHopsCount = 0;

  for (const chunk of MOCK_KNOWLEDGE_CHUNKS) {
    evaluatedCount++;
    const asset = MOCK_ASSETS.find(a => a.id === chunk.asset_id)!;
    const vendor = MOCK_VENDORS.find(v => v.id === asset.vendor_id)!;
    const businessUnit = MOCK_BUSINESS_UNITS.find(b => b.id === asset.business_unit_id)!;
    const incident = MOCK_INCIDENTS.find(i => i.asset_id === asset.id);

    // Vector similarity score
    const vectorScore = computeSimulatedCosineSimilarity(query, chunk);

    // RBAC Security Clearance Pre-filter:
    // Determine required clearance from chunk or linked incident
    const chunkRequiredClearance: SecurityClearanceLevel =
      chunk.security_clearance || chunk.metadata?.security_clearance || 'L1_PUBLIC';
    const incidentRequiredClearance: SecurityClearanceLevel =
      incident?.security_clearance || 'L1_PUBLIC';

    const effectiveRequiredClearance: SecurityClearanceLevel =
      CLEARANCE_HIERARCHY[incidentRequiredClearance] > CLEARANCE_HIERARCHY[chunkRequiredClearance]
        ? incidentRequiredClearance
        : chunkRequiredClearance;

    // Check authorization: if user does not have sufficient clearance, REDACT from vector candidate space
    if (!isAuthorized(userClearance, effectiveRequiredClearance)) {
      redactedNotices.push({
        id: chunk.id,
        documentTitle: chunk.document_title,
        requiredClearance: effectiveRequiredClearance,
        vectorSimilarity: vectorScore,
        reason: `Restricted under ${effectiveRequiredClearance} policy. Current session clearance (${userClearance}) is insufficient to access this document or incident log.`,
      });
      continue; // Exclude from RRF candidates
    }

    // Relational SQL filter matching
    let sqlMatches = true;

    // Region: manual override takes priority, else extracted
    const targetRegion = (overrideRegion && overrideRegion !== 'all') ? overrideRegion : analysis.extractedFilters.region;
    if (targetRegion && asset.region !== targetRegion) {
      sqlMatches = false;
    }

    // Tier: manual override takes priority, else extracted
    const targetTier = (overrideTier && overrideTier !== 'all') ? Number(overrideTier) : analysis.extractedFilters.vendorTier;
    if (targetTier && vendor.tier !== targetTier) {
      sqlMatches = false;
    }

    if (analysis.extractedFilters.contractStatus && vendor.contract_status !== analysis.extractedFilters.contractStatus) {
      sqlMatches = false;
    }
    if (analysis.extractedFilters.assetType && asset.type !== analysis.extractedFilters.assetType) {
      sqlMatches = false;
    }
    if (analysis.extractedFilters.severity && incident?.severity !== analysis.extractedFilters.severity) {
      sqlMatches = false;
    }

    // Graph relevance score (structural distance to query entities & multi-hop traversal)
    let graphScore = 0.5;
    const hopPath = [
      `[Vendor: ${vendor.name} (Tier ${vendor.tier})]`,
      `--supplies--> [Asset: ${asset.name} (${asset.type})]`,
      `--impacts--> [BU: ${businessUnit.name}]`,
    ];
    graphHopsCount += 3;

    if (incident) {
      hopPath.push(`--tied-to--> [Incident: ${incident.title} (${incident.severity})]`);
      graphHopsCount += 1;
      graphScore += 0.3;
    }
    if (asset.criticality === 'mission-critical') {
      graphScore += 0.15;
    }

    candidates.push({
      chunk,
      asset,
      vendor,
      businessUnit,
      incident,
      vectorScore,
      graphRelevanceScore: Math.min(1.0, graphScore),
      sqlFilterMatched: sqlMatches,
      hopPath,
    });
  }

  // Filter candidates if strict SQL filtering is enforced
  const filteredPool = applySqlFilters ? candidates.filter(c => c.sqlFilterMatched) : candidates;
  const poolToRank = filteredPool.length > 0 ? filteredPool : candidates;

  // Compute vector ranks
  const sortedByVector = [...poolToRank].sort((a, b) => b.vectorScore - a.vectorScore);
  const vectorRankMap = new Map<string, number>();
  sortedByVector.forEach((item, idx) => {
    vectorRankMap.set(item.chunk.id, idx + 1);
  });

  // Compute graph ranks
  const sortedByGraph = [...poolToRank].sort((a, b) => b.graphRelevanceScore - a.graphRelevanceScore);
  const graphRankMap = new Map<string, number>();
  sortedByGraph.forEach((item, idx) => {
    graphRankMap.set(item.chunk.id, idx + 1);
  });

  // Calculate RRF and final results
  const results: HybridSearchResult[] = poolToRank.map(item => {
    const vRank = vectorRankMap.get(item.chunk.id) || 10;
    const gRank = useGraphRank ? (graphRankMap.get(item.chunk.id) || 10) : 0;
    const rrfScore = calculateRRFScore(vRank, gRank, kConstant);

    return {
      chunk: item.chunk,
      asset: item.asset,
      vendor: item.vendor,
      businessUnit: item.businessUnit,
      incident: item.incident,
      vectorSimilarity: item.vectorScore,
      vectorRank: vRank,
      graphRelevance: item.graphRelevanceScore,
      graphRank: gRank,
      sqlFilterMatched: item.sqlFilterMatched,
      rrfScore,
      hopPath: item.hopPath,
    };
  });

  // Sort by final RRF score descending and limit
  const sortedResults = results.sort((a, b) => b.rrfScore - a.rrfScore).slice(0, maxResults);

  return {
    results: sortedResults,
    redactedNotices: redactedNotices.sort((a, b) => b.vectorSimilarity - a.vectorSimilarity),
    activeClearance: userClearance,
    totalCandidatesEvaluated: evaluatedCount,
    graphHopsResolved: graphHopsCount,
  };
}

/**
 * Legacy/Standard signature returning HybridSearchResult[] for direct consumers
 */
export function executeHybridRetrieval(
  query: string,
  analysis: QueryAnalysis,
  options: HybridRetrievalOptions = { applySqlFilters: true, useGraphRank: true, maxResults: 5 }
): HybridSearchResult[] {
  return executeHybridRetrievalWithRbac(query, analysis, options).results;
}
