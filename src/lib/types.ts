export type VendorTier = 1 | 2 | 3;
export type ContractStatus = 'active' | 'under_review' | 'expired' | 'terminated';
export type AssetType = 'database' | 'server' | 'storage' | 'network_switch' | 'cloud_service';
export type IncidentSeverity = 'SEV-1' | 'SEV-2' | 'SEV-3';
export type SecurityClearanceLevel = 'L1_PUBLIC' | 'L2_CONFIDENTIAL' | 'L3_RESTRICTED';

export interface Vendor {
  id: string;
  name: string;
  tier: VendorTier;
  contract_status: ContractStatus;
  security_clearance?: SecurityClearanceLevel;
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
  security_clearance?: SecurityClearanceLevel;
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
  security_clearance?: SecurityClearanceLevel;
}

export interface KnowledgeChunk {
  id: string;
  asset_id: string;
  document_title: string;
  doc_type: 'architecture_spec' | 'incident_postmortem' | 'runbook' | 'vendor_sla';
  chunk_index: number;
  chunk_text: string;
  security_clearance?: SecurityClearanceLevel;
  metadata: {
    author: string;
    last_reviewed: string;
    tags: string[];
    security_clearance?: SecurityClearanceLevel;
    source?: string;
    alertId?: string;
    ingestionTimestamp?: string;
  };
  // Simulated dense embedding vector representation (or sample dimensions)
  synthetic_vector?: number[];
}

export interface RedactedDocumentNotice {
  id: string;
  documentTitle: string;
  requiredClearance: SecurityClearanceLevel;
  vectorSimilarity: number;
  reason: string;
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

export interface HybridRetrievalExecutionResponse {
  results: HybridSearchResult[];
  redactedNotices: RedactedDocumentNotice[];
  activeClearance: SecurityClearanceLevel;
  totalCandidatesEvaluated: number;
  graphHopsResolved: number;
}

// Multi-Modal Architecture Vision Extraction
export interface ExtractedGraphNode {
  id: string;
  name: string;
  type: AssetType;
  vendor: string;
  region: string;
  criticality: 'mission-critical' | 'business-operational' | 'internal-support';
  securityClearance: SecurityClearanceLevel;
}

export interface ExtractedGraphEdge {
  source: string;
  target: string;
  relationship: 'SUPPLIES' | 'IMPACTS' | 'REPLICATES_TO' | 'ROUTES_TRAFFIC_TO' | 'PROTECTS';
  protocol?: string;
}

export interface ArchitectureDiagramAnalysisResult {
  diagramTitle: string;
  cloudProvider: string;
  detectedTopology: string;
  nodes: ExtractedGraphNode[];
  edges: ExtractedGraphEdge[];
  extractedSlaRisks: string[];
  ingestedToLiveGraph?: boolean;
}

// Real-Time Webhook Alert
export interface LiveIncidentAlertPayload {
  source: 'pagerduty' | 'jira' | 'cloudwatch' | 'simulator';
  alertId: string;
  title: string;
  severity: IncidentSeverity;
  rootCause: string;
  assetIdentifier: string;
  downtimeMinutes: number;
  tags?: string[];
}

