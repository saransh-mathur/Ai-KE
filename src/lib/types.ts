export type VendorTier = 1 | 2 | 3;
export type ContractStatus = 'active' | 'under_review' | 'expired' | 'terminated';
export type AssetType = 'database' | 'server' | 'storage' | 'network_switch' | 'cloud_service';
export type IncidentSeverity = 'SEV-1' | 'SEV-2' | 'SEV-3';

export interface Vendor {
  id: string;
  name: string;
  tier: VendorTier;
  contract_status: ContractStatus;
  metadata: {
    category: string;
    account_manager: string;
    sla_percentage: number;
    headquarters: string;
  };
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  region: string;
  vendor_id: string;
  specs: {
    cores?: number;
    ram_gb?: number;
    storage_tb?: number;
    os?: string;
    throughput_gbps?: number;
  };
  business_unit_id: string;
  criticality: 'mission-critical' | 'business-operational' | 'internal-support';
}

export interface BusinessUnit {
  id: string;
  name: string;
  cost_center: string;
  lead: string;
}

export interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  root_cause: string;
  asset_id: string;
  resolved_at: string;
  downtime_minutes: number;
}

export interface KnowledgeChunk {
  id: string;
  asset_id: string;
  document_title: string;
  doc_type: 'architecture_spec' | 'incident_postmortem' | 'runbook' | 'vendor_sla';
  chunk_index: number;
  chunk_text: string;
  metadata: {
    author: string;
    last_reviewed: string;
    tags: string[];
  };
  // Simulated dense embedding vector representation (or sample dimensions)
  synthetic_vector?: number[];
}

export interface HybridSearchResult {
  chunk: KnowledgeChunk;
  asset: Asset;
  vendor: Vendor;
  businessUnit: BusinessUnit;
  incident?: Incident;
  vectorSimilarity: number; // 0 to 1
  vectorRank: number;
  graphRelevance: number; // 0 to 1
  graphRank: number;
  sqlFilterMatched: boolean;
  rrfScore: number;
  hopPath: string[];
}
