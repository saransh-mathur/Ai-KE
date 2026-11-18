-- ============================================================================
-- Enterprise IT Asset & Vendor Semantic Knowledge Engine
-- End-to-End PostgreSQL 16 (+ optional pgvector & pg_trgm) Bootstrap Script
-- Idempotent: Safe to run repeatedly on empty or populated databases.
-- ============================================================================

-- 1. Extensions (pgvector and pg_trgm enable HNSW vector + fuzzy search when installed)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm extension not available on this host; skipping.';
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available on this host; falling back to JSONB/relational ranking.';
END $$;

-- 2. Relational & Knowledge Schema (100% aligned with src/db/schema.ts)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  photo_url TEXT,
  role TEXT NOT NULL DEFAULT 'enterprise-architect',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,
  contract_status TEXT NOT NULL,
  category TEXT NOT NULL,
  account_manager TEXT NOT NULL,
  sla_percentage DOUBLE PRECISION NOT NULL,
  headquarters TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendors_tier ON vendors (tier);
CREATE INDEX IF NOT EXISTS idx_vendors_contract_status ON vendors (contract_status);
CREATE INDEX IF NOT EXISTS idx_vendors_metadata_gin ON vendors USING gin (metadata jsonb_path_ops);

CREATE TABLE IF NOT EXISTS business_units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  cost_center TEXT NOT NULL,
  lead_contact TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_units_cost_center ON business_units (cost_center);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  region TEXT NOT NULL,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  business_unit_id TEXT NOT NULL REFERENCES business_units(id) ON DELETE RESTRICT,
  criticality TEXT NOT NULL,
  specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assets_vendor_id ON assets (vendor_id);
CREATE INDEX IF NOT EXISTS idx_assets_business_unit_id ON assets (business_unit_id);
CREATE INDEX IF NOT EXISTS idx_assets_type_region ON assets (type, region);
CREATE INDEX IF NOT EXISTS idx_assets_specs_gin ON assets USING gin (specs jsonb_path_ops);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  downtime_minutes INTEGER NOT NULL DEFAULT 0,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incidents_asset_id ON incidents (asset_id);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents (severity);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  document_title TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 1,
  chunk_text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_asset_id ON knowledge_chunks (asset_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc_type ON knowledge_chunks (doc_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_metadata_gin ON knowledge_chunks USING gin (metadata jsonb_path_ops);

-- Optional pgvector embedding column + HNSW cosine index when vector extension is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding vector(768);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_hnsw
      ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS saved_queries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  query_text TEXT NOT NULL,
  filters_applied JSONB NOT NULL DEFAULT '{}'::jsonb,
  top_result_doc TEXT,
  rrf_score DOUBLE PRECISION,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_queries_created_at ON saved_queries (created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  event_action TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_asset_id TEXT,
  generated_incident_id TEXT,
  generated_chunk_id TEXT,
  status TEXT NOT NULL DEFAULT 'processed',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events (source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events (created_at);

CREATE TABLE IF NOT EXISTS feedback_logs (
  id SERIAL PRIMARY KEY,
  query_text TEXT NOT NULL,
  answer_snippet TEXT NOT NULL,
  rating TEXT NOT NULL,
  feedback_note TEXT,
  selected_doc_id TEXT,
  suggested_doc_id TEXT,
  user_email TEXT NOT NULL DEFAULT 'guest@enterprise-engine.local',
  rrf_weight_adjustment JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_logs_rating ON feedback_logs (rating);
CREATE INDEX IF NOT EXISTS idx_feedback_logs_created_at ON feedback_logs (created_at);

CREATE TABLE IF NOT EXISTS audio_transcripts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL DEFAULT 'guest@enterprise-engine.local',
  mime_type TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  transcript_text TEXT NOT NULL,
  model_used TEXT NOT NULL DEFAULT 'gemini-3.5-transcribe',
  target_context TEXT NOT NULL DEFAULT 'search_query',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Knowledge Graph View (4-Hop Relationship Chain)
CREATE OR REPLACE VIEW v_enterprise_knowledge_graph AS
SELECT
  v.id AS vendor_id,
  v.name AS vendor_name,
  v.tier AS vendor_tier,
  v.contract_status,
  a.id AS asset_id,
  a.name AS asset_name,
  a.type AS asset_type,
  a.region AS asset_region,
  a.criticality,
  bu.id AS business_unit_id,
  bu.name AS business_unit_name,
  bu.cost_center,
  inc.id AS incident_id,
  inc.title AS incident_title,
  inc.severity AS incident_severity,
  inc.downtime_minutes
FROM assets a
JOIN vendors v ON a.vendor_id = v.id
JOIN business_units bu ON a.business_unit_id = bu.id
LEFT JOIN incidents inc ON inc.asset_id = a.id;
