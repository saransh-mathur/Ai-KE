import {
  MOCK_VENDORS,
  MOCK_BUSINESS_UNITS,
  MOCK_ASSETS,
  MOCK_INCIDENTS,
  MOCK_KNOWLEDGE_CHUNKS,
} from './mock-data.ts';

export interface SeedPayloads {
  vendors: Array<{
    id: string;
    name: string;
    tier: string;
    contractStatus: string;
    category: string;
    accountManager: string;
    slaPercentage: number;
    headquarters: string;
    metadata: Record<string, unknown>;
  }>;
  businessUnits: Array<{
    id: string;
    name: string;
    costCenter: string;
    leadContact: string;
  }>;
  assets: Array<{
    id: string;
    name: string;
    type: string;
    region: string;
    vendorId: string;
    businessUnitId: string;
    criticality: string;
    specs: Record<string, unknown>;
  }>;
  incidents: Array<{
    id: string;
    title: string;
    severity: string;
    rootCause: string;
    assetId: string;
    downtimeMinutes: number;
    resolvedAt: Date | null;
  }>;
  knowledgeChunks: Array<{
    id: string;
    assetId: string;
    documentTitle: string;
    docType: string;
    chunkIndex: number;
    chunkText: string;
    metadata: Record<string, unknown>;
  }>;
}

export function buildSeedPayloads(): SeedPayloads {
  return {
    vendors: MOCK_VENDORS.map((v) => ({
      id: v.id,
      name: v.name,
      tier: String(v.tier),
      contractStatus: v.contract_status,
      category: v.metadata.category,
      accountManager: v.metadata.account_manager,
      slaPercentage: v.metadata.sla_percentage,
      headquarters: v.metadata.headquarters,
      metadata: { ...v.metadata },
    })),
    businessUnits: MOCK_BUSINESS_UNITS.map((bu) => ({
      id: bu.id,
      name: bu.name,
      costCenter: bu.cost_center,
      leadContact: bu.lead,
    })),
    assets: MOCK_ASSETS.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      region: a.region,
      vendorId: a.vendor_id,
      businessUnitId: a.business_unit_id,
      criticality: a.criticality,
      specs: { ...a.specs },
    })),
    incidents: MOCK_INCIDENTS.map((inc) => ({
      id: inc.id,
      title: inc.title,
      severity: inc.severity,
      rootCause: inc.root_cause,
      assetId: inc.asset_id,
      downtimeMinutes: inc.downtime_minutes,
      resolvedAt: inc.resolved_at ? new Date(inc.resolved_at) : null,
    })),
    knowledgeChunks: MOCK_KNOWLEDGE_CHUNKS.map((chk) => ({
      id: chk.id,
      assetId: chk.asset_id,
      documentTitle: chk.document_title,
      docType: chk.doc_type,
      chunkIndex: chk.chunk_index,
      chunkText: chk.chunk_text,
      metadata: { ...chk.metadata },
    })),
  };
}
