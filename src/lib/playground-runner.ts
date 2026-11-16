import { Vendor, Asset, BusinessUnit, Incident, KnowledgeChunk } from './types.ts';
import {
  MOCK_VENDORS,
  MOCK_ASSETS,
  MOCK_BUSINESS_UNITS,
  MOCK_INCIDENTS,
  MOCK_KNOWLEDGE_CHUNKS,
} from './mock-data.ts';
import { PRODUCTION_RETRIEVAL_SQL } from './architecture-data.ts';

export type PlaygroundScriptType = 'sql' | 'graph';

export interface PlaygroundDataset {
  vendors: Vendor[];
  assets: Asset[];
  businessUnits: BusinessUnit[];
  incidents: Incident[];
  knowledgeChunks: KnowledgeChunk[];
}

export interface PlaygroundExecutionResult {
  ok: boolean;
  scriptType: PlaygroundScriptType;
  title: string;
  durationMs: number;
  rowCount: number;
  columns: string[];
  rows: Record<string, string | number | null>[];
  graphPaths?: Array<{
    vendor: string;
    vendorTier: string;
    asset: string;
    region: string;
    businessUnit: string;
    costCenter: string;
    incident: string | null;
    severity: string | null;
  }>;
  summary: string;
  error?: string;
}

export const GRAPH_TRAVERSAL_TEMPLATE = `-- Multi-Hop Graph Traversal: Vendor -> Asset -> Business Unit -> Incident
MATCH (v:Vendor)-[:SUPPLIES]->(a:Asset)-[:IMPACTS]->(bu:BusinessUnit)
OPTIONAL MATCH (a)<-[:AFFECTED_BY]-(inc:Incident)
WHERE v.tier = '1'
  AND a.region = 'us-east-1'
RETURN v.name AS vendor, a.name AS asset, bu.name AS business_unit, inc.severity AS severity
ORDER BY inc.downtime_minutes DESC
LIMIT 5;`;

export const DEFAULT_SQL_AUDIT_SCRIPT = `-- SQL Audit: Active Tier-1 & Tier-2 Vendors with Mission-Critical Assets
SELECT
  v.name AS vendor_name,
  v.tier AS vendor_tier,
  a.name AS asset_name,
  a.region,
  bu.cost_center,
  inc.severity
FROM assets a
JOIN vendors v ON a.vendor_id = v.id
JOIN business_units bu ON a.business_unit_id = bu.id
LEFT JOIN incidents inc ON a.id = inc.asset_id
WHERE a.criticality = 'mission-critical'
ORDER BY v.tier ASC
LIMIT 10;`;

export const US_WEST_GRAPH_SCRIPT = `-- Multi-Hop Graph Traversal: Retail & Spine Switches (us-west-2)
MATCH (v:Vendor)-[:SUPPLIES]->(a:Asset)-[:IMPACTS]->(bu:BusinessUnit)
WHERE a.region = 'us-west-2'
RETURN v.name AS vendor, a.name AS asset, bu.cost_center AS cost_center
LIMIT 5;`;

export const DEFAULT_DATASET: PlaygroundDataset = {
  vendors: MOCK_VENDORS,
  assets: MOCK_ASSETS,
  businessUnits: MOCK_BUSINESS_UNITS,
  incidents: MOCK_INCIDENTS,
  knowledgeChunks: MOCK_KNOWLEDGE_CHUNKS,
};

/**
 * Extracts simple filter predicates from a SQL or Graph traversal script.
 */
export function extractScriptPredicates(script: string): {
  tier?: string;
  region?: string;
  severity?: string;
  criticality?: string;
  contractStatus?: string;
  limit: number;
  rrfK: number;
  targetTable: 'vendors' | 'assets' | 'incidents' | 'knowledge_chunks' | 'hybrid';
} {
  const normalized = script.toLowerCase();

  const tierMatch =
    script.match(/tier\s*=\s*['"]?([123])['"]?/i) ||
    script.match(/\$2[^'\n]*['"]([123])['"]/i);
  const regionMatch = script.match(
    /region\s*=\s*['"]([a-z0-9-]+)['"]/i
  );
  const severityMatch = script.match(
    /severity\s*=\s*['"](SEV-[123])['"]/i
  );
  const critMatch = script.match(
    /criticality\s*=\s*['"]([a-z-]+)['"]/i
  );
  const statusMatch = script.match(
    /contract_status\s*=\s*['"]([a-z_]+)['"]/i
  );
  const limitMatch = script.match(/\bLIMIT\s+(\d+)\b/i);
  const kMatch = script.match(/k_rrf\s*(?:=|:)\s*(\d+)/i);

  let targetTable: 'vendors' | 'assets' | 'incidents' | 'knowledge_chunks' | 'hybrid' = 'hybrid';
  if (!normalized.includes('join') && !normalized.includes('match') && !normalized.includes('with ')) {
    if (/\bfrom\s+vendors\b/i.test(script)) targetTable = 'vendors';
    else if (/\bfrom\s+incidents\b/i.test(script)) targetTable = 'incidents';
    else if (/\bfrom\s+knowledge_chunks\b/i.test(script)) targetTable = 'knowledge_chunks';
    else if (/\bfrom\s+assets\b/i.test(script)) targetTable = 'assets';
  }

  const parsedLimit = limitMatch ? Math.min(25, Math.max(1, Number(limitMatch[1]))) : 8;

  return {
    tier: tierMatch ? tierMatch[1] : undefined,
    region: regionMatch ? regionMatch[1].toLowerCase() : undefined,
    severity: severityMatch ? severityMatch[1].toUpperCase() : undefined,
    criticality: critMatch ? critMatch[1].toLowerCase() : undefined,
    contractStatus: statusMatch ? statusMatch[1].toLowerCase() : undefined,
    limit: parsedLimit,
    rrfK: kMatch ? Number(kMatch[1]) : 60,
    targetTable,
  };
}

/**
 * Derives a concise human-readable title for a SQL or Graph script.
 */
export function deriveScriptTitle(script: string, scriptType: PlaygroundScriptType): string {
  const firstComment = script
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('--') || l.startsWith('//'));

  if (firstComment) {
    const cleaned = firstComment.replace(/^(--|\/\/)\s*/, '').replace(/^=+|=+$/g, '').trim();
    if (cleaned.length >= 6 && !/^Production Hybrid Retrieval Query$/i.test(cleaned)) {
      return cleaned.slice(0, 68);
    }
    if (cleaned.length >= 6) {
      return cleaned.slice(0, 68);
    }
  }

  const firstCodeLine = script
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('--') && !l.startsWith('//'));

  if (firstCodeLine) {
    return `${scriptType === 'graph' ? 'Graph' : 'SQL'}: ${firstCodeLine.slice(0, 56)}`;
  }

  return scriptType === 'graph' ? 'Graph Traversal Script' : 'SQL Query Script';
}

/**
 * Validates and executes an SQL or Graph Traversal script against the loaded dataset.
 */
export function executePlaygroundScript(
  script: string,
  scriptType: PlaygroundScriptType,
  dataset: PlaygroundDataset = DEFAULT_DATASET
): PlaygroundExecutionResult {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const trimmed = script.trim();

  if (!trimmed) {
    return {
      ok: false,
      scriptType,
      title: deriveScriptTitle(script, scriptType),
      durationMs: 1,
      rowCount: 0,
      columns: [],
      rows: [],
      summary: 'Script editor is empty.',
      error: 'Please enter a SQL query or graph traversal script before running.',
    };
  }

  // Block destructive SQL keywords cleanly
  const forbiddenMatch = trimmed.match(/\b(DROP|TRUNCATE|DELETE|ALTER|INSERT|UPDATE)\b/i);
  if (forbiddenMatch) {
    return {
      ok: false,
      scriptType,
      title: deriveScriptTitle(script, scriptType),
      durationMs: 1,
      rowCount: 0,
      columns: [],
      rows: [],
      summary: `Blocked non-read-only keyword: ${forbiddenMatch[1].toUpperCase()}`,
      error: `Read-only playground security policy blocked "${forbiddenMatch[1].toUpperCase()}". Use SELECT, WITH, or MATCH traversal statements.`,
    };
  }

  const predicates = extractScriptPredicates(trimmed);
  const title = deriveScriptTitle(trimmed, scriptType);

  if (scriptType === 'graph') {
    const paths = dataset.assets
      .map((asset) => {
        const vendor = dataset.vendors.find((v) => v.id === asset.vendor_id);
        const bu = dataset.businessUnits.find((b) => b.id === asset.business_unit_id);
        const incident = dataset.incidents.find((i) => i.asset_id === asset.id) || null;
        return { asset, vendor, bu, incident };
      })
      .filter(({ asset, vendor, incident }) => {
        if (!vendor) return false;
        if (predicates.tier && String(vendor.tier) !== predicates.tier) return false;
        if (predicates.region && asset.region.toLowerCase() !== predicates.region) return false;
        if (predicates.criticality && asset.criticality.toLowerCase() !== predicates.criticality) return false;
        if (predicates.severity && incident?.severity.toUpperCase() !== predicates.severity) return false;
        return true;
      })
      .slice(0, predicates.limit);

    const graphPaths = paths.map(({ asset, vendor, bu, incident }) => ({
      vendor: vendor!.name,
      vendorTier: `Tier ${vendor!.tier}`,
      asset: asset.name,
      region: asset.region,
      businessUnit: bu?.name || 'Unassigned BU',
      costCenter: bu?.cost_center || 'N/A',
      incident: incident?.title || null,
      severity: incident?.severity || null,
    }));

    const rows = graphPaths.map((p) => ({
      vendor: p.vendor,
      tier: p.vendorTier,
      asset: p.asset,
      region: p.region,
      business_unit: p.businessUnit,
      cost_center: p.costCenter,
      incident_severity: p.severity || 'None',
    }));

    const elapsed = Math.max(1, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start));

    return {
      ok: true,
      scriptType: 'graph',
      title,
      durationMs: elapsed,
      rowCount: rows.length,
      columns: ['vendor', 'tier', 'asset', 'region', 'business_unit', 'cost_center', 'incident_severity'],
      rows,
      graphPaths,
      summary: `Traversed ${rows.length} multi-hop path${rows.length === 1 ? '' : 's'} across Vendor -> Asset -> BusinessUnit -> Incident`,
    };
  }

  // SQL Execution paths
  let rows: Record<string, string | number | null>[] = [];
  let columns: string[] = [];

  if (predicates.targetTable === 'vendors') {
    const filtered = dataset.vendors
      .filter((v) => {
        if (predicates.tier && String(v.tier) !== predicates.tier) return false;
        if (predicates.contractStatus && v.contract_status.toLowerCase() !== predicates.contractStatus) return false;
        return true;
      })
      .slice(0, predicates.limit);

    columns = ['id', 'name', 'tier', 'contract_status', 'category', 'sla_percentage'];
    rows = filtered.map((v) => ({
      id: v.id,
      name: v.name,
      tier: `Tier ${v.tier}`,
      contract_status: v.contract_status,
      category: v.metadata.category,
      sla_percentage: v.metadata.sla_percentage,
    }));
  } else if (predicates.targetTable === 'incidents') {
    const filtered = dataset.incidents
      .filter((inc) => {
        if (predicates.severity && inc.severity.toUpperCase() !== predicates.severity) return false;
        return true;
      })
      .slice(0, predicates.limit);

    columns = ['id', 'severity', 'title', 'asset_id', 'downtime_minutes', 'clearance'];
    rows = filtered.map((inc) => ({
      id: inc.id,
      severity: inc.severity,
      title: inc.title,
      asset_id: inc.asset_id,
      downtime_minutes: inc.downtime_minutes,
      clearance: inc.security_clearance ?? 'L1_PUBLIC',
    }));
  } else if (predicates.targetTable === 'knowledge_chunks') {
    const filtered = dataset.knowledgeChunks.slice(0, predicates.limit);
    columns = ['id', 'asset_id', 'doc_type', 'document_title', 'clearance'];
    rows = filtered.map((c) => ({
      id: c.id,
      asset_id: c.asset_id,
      doc_type: c.doc_type,
      document_title: c.document_title,
      clearance: c.security_clearance ?? 'L1_PUBLIC',
    }));
  } else {
    // Hybrid CTE / Multi-table JOIN evaluation (matching PRODUCTION_RETRIEVAL_SQL)
    const isProductionCte = trimmed.includes('WITH filtered_entities') || trimmed === PRODUCTION_RETRIEVAL_SQL.trim();

    const joined = dataset.knowledgeChunks
      .map((chunk, idx) => {
        const asset = dataset.assets.find((a) => a.id === chunk.asset_id);
        if (!asset) return null;
        const vendor = dataset.vendors.find((v) => v.id === asset.vendor_id);
        const bu = dataset.businessUnits.find((b) => b.id === asset.business_unit_id);
        const incident = dataset.incidents.find((i) => i.asset_id === asset.id) || null;
        if (!vendor || !bu) return null;

        const vectorRank = idx + 1;
        const graphRank = incident?.severity === 'SEV-1' ? 1 : incident ? 2 : 4;
        const rrfScore = Number(
          (1 / (predicates.rrfK + vectorRank) + 1 / (predicates.rrfK + graphRank)).toFixed(5)
        );
        const cosineSim = Number(Math.max(0.72, 0.96 - idx * 0.03).toFixed(3));

        return { chunk, asset, vendor, bu, incident, rrfScore, cosineSim };
      })
      .filter((entry): entry is NonNullable<typeof entry> => {
        if (!entry) return false;
        if (predicates.tier && String(entry.vendor.tier) !== predicates.tier) return false;
        if (predicates.region && entry.asset.region.toLowerCase() !== predicates.region) return false;
        if (predicates.criticality && entry.asset.criticality.toLowerCase() !== predicates.criticality) return false;
        if (predicates.severity && entry.incident?.severity.toUpperCase() !== predicates.severity) return false;
        if (predicates.contractStatus && entry.vendor.contract_status.toLowerCase() !== predicates.contractStatus) return false;
        return true;
      })
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, predicates.limit);

    if (isProductionCte) {
      columns = ['chunk_id', 'document_title', 'vendor_name', 'asset_name', 'region', 'cosine_sim', 'rrf_score'];
      rows = joined.map((item) => ({
        chunk_id: item.chunk.id,
        document_title: item.chunk.document_title,
        vendor_name: item.vendor.name,
        asset_name: item.asset.name,
        region: item.asset.region,
        cosine_sim: item.cosineSim,
        rrf_score: item.rrfScore,
      }));
    } else {
      columns = ['asset_name', 'vendor_name', 'vendor_tier', 'region', 'cost_center', 'severity', 'document_title'];
      rows = joined.map((item) => ({
        asset_name: item.asset.name,
        vendor_name: item.vendor.name,
        vendor_tier: `Tier ${item.vendor.tier}`,
        region: item.asset.region,
        cost_center: item.bu.cost_center,
        severity: item.incident?.severity || 'None',
        document_title: item.chunk.document_title,
      }));
    }
  }

  const elapsed = Math.max(1, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start));

  return {
    ok: true,
    scriptType: 'sql',
    title,
    durationMs: elapsed,
    rowCount: rows.length,
    columns,
    rows,
    summary: `Executed read-only PostgreSQL CTE query (${rows.length} row${rows.length === 1 ? '' : 's'} returned in ${elapsed}ms)`,
  };
}
