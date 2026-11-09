export const PRODUCTION_SQL_DDL = `-- ============================================================================
-- Enterprise IT Asset & Vendor Semantic Knowledge Engine
-- PostgreSQL 16+ with pgvector 0.7.0+ Extension
-- ============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector for dense embeddings
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Trigram index for fuzzy text matching

-- 2. Enumerated types for strict domain validation
CREATE TYPE vendor_tier_enum AS ENUM ('1', '2', '3');
CREATE TYPE contract_status_enum AS ENUM ('active', 'under_review', 'expired', 'terminated');
CREATE TYPE asset_type_enum AS ENUM ('database', 'server', 'storage', 'network_switch', 'cloud_service');
CREATE TYPE asset_criticality_enum AS ENUM ('mission-critical', 'business-operational', 'internal-support');
CREATE TYPE incident_severity_enum AS ENUM ('SEV-1', 'SEV-2', 'SEV-3');

-- 3. Vendors Table (Master Data)
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    tier vendor_tier_enum NOT NULL DEFAULT '2',
    contract_status contract_status_enum NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Indexing on vendors
CREATE INDEX idx_vendors_tier ON vendors (tier);
CREATE INDEX idx_vendors_contract_status ON vendors (contract_status);
CREATE INDEX idx_vendors_metadata_gin ON vendors USING gin (metadata jsonb_path_ops);

-- 4. Business Units (Taxonomy & Organization)
CREATE TABLE IF NOT EXISTS business_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    cost_center VARCHAR(64) NOT NULL,
    lead_contact VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 5. Assets Table (Relational Hardware & Cloud Inventory)
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type asset_type_enum NOT NULL,
    region VARCHAR(64) NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    business_unit_id UUID NOT NULL REFERENCES business_units(id) ON DELETE RESTRICT,
    criticality asset_criticality_enum NOT NULL DEFAULT 'business-operational',
    specs JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Indexing on assets
CREATE INDEX idx_assets_vendor_id ON assets (vendor_id);
CREATE INDEX idx_assets_business_unit_id ON assets (business_unit_id);
CREATE INDEX idx_assets_type_region ON assets (type, region);
CREATE INDEX idx_assets_specs_gin ON assets USING gin (specs jsonb_path_ops);

-- 6. Incidents Table (Structural Graph Nodes for Post-Mortems)
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    title VARCHAR(512) NOT NULL,
    severity incident_severity_enum NOT NULL,
    root_cause TEXT NOT NULL,
    downtime_minutes INTEGER NOT NULL DEFAULT 0,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_incidents_asset_id ON incidents (asset_id);
CREATE INDEX idx_incidents_severity ON incidents (severity);

-- 7. Knowledge Chunks Table (pgvector Semantic Storage)
-- Vector dimension = 768 for nomic-embed-text (or 1536 for text-embedding-3-small)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    document_title VARCHAR(512) NOT NULL,
    doc_type VARCHAR(64) NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    chunk_text TEXT NOT NULL,
    embedding vector(768) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- 8. High-Performance HNSW Vector Index
-- HNSW (Hierarchical Navigable Small World) provides superior query recall and QPS over IVFFlat.
-- m = 16: max bi-directional links per node (16-32 typical for enterprise docs)
-- ef_construction = 64: search size during index build (64-128 balances build time vs index quality)
CREATE INDEX idx_knowledge_chunks_embedding_hnsw 
ON knowledge_chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_knowledge_chunks_asset_id ON knowledge_chunks (asset_id);
CREATE INDEX idx_knowledge_chunks_metadata_gin ON knowledge_chunks USING gin (metadata jsonb_path_ops);
`;

export const PRODUCTION_SQLALCHEMY_MODELS = `"""
enterprise_models.py
SQLAlchemy 2.0 Async declarative models with pgvector integration.
"""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum as SQLEnum, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
import enum

class Base(DeclarativeBase):
    pass

class VendorTier(str, enum.Enum):
    TIER_1 = "1"
    TIER_2 = "2"
    TIER_3 = "3"

class ContractStatus(str, enum.Enum):
    ACTIVE = "active"
    UNDER_REVIEW = "under_review"
    EXPIRED = "expired"
    TERMINATED = "terminated"

class AssetType(str, enum.Enum):
    DATABASE = "database"
    SERVER = "server"
    STORAGE = "storage"
    NETWORK_SWITCH = "network_switch"
    CLOUD_SERVICE = "cloud_service"

class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    tier: Mapped[VendorTier] = mapped_column(SQLEnum(VendorTier), default=VendorTier.TIER_2, index=True)
    contract_status: Mapped[ContractStatus] = mapped_column(
        SQLEnum(ContractStatus), default=ContractStatus.ACTIVE, index=True
    )
    metadata_: Mapped[Dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("clock_timestamp()"))

    # Relationships
    assets: Mapped[List[Asset]] = relationship("Asset", back_populates="vendor")

class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[AssetType] = mapped_column(SQLEnum(AssetType), nullable=False, index=True)
    region: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    vendor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vendors.id"), nullable=False)
    business_unit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("business_units.id"), nullable=False)
    criticality: Mapped[str] = mapped_column(String(64), default="business-operational")
    specs: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)

    # Relationships
    vendor: Mapped[Vendor] = relationship("Vendor", back_populates="assets")
    incidents: Mapped[List[Incident]] = relationship("Incident", back_populates="asset")
    chunks: Mapped[List[KnowledgeChunk]] = relationship("KnowledgeChunk", back_populates="asset")

class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assets.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    root_cause: Mapped[str] = mapped_column(String, nullable=False)
    downtime_minutes: Mapped[int] = mapped_column(Integer, default=0)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    asset: Mapped[Asset] = relationship("Asset", back_populates="incidents")

class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assets.id"), nullable=False)
    document_title: Mapped[str] = mapped_column(String(512), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(64), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    chunk_text: Mapped[str] = mapped_column(String, nullable=False)
    # nomic-embed-text is 768 dimensions
    embedding: Mapped[List[float]] = mapped_column(Vector(768), nullable=False)
    metadata_: Mapped[Dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)

    asset: Mapped[Asset] = relationship("Asset", back_populates="chunks")
`;

export const PRODUCTION_RETRIEVAL_SQL = `-- ============================================================================
-- Production Hybrid Retrieval Query (CTE with Graph Traversal + Vector HNSW + RRF)
-- Parameters:
--   $1: query_embedding (vector(768))
--   $2: vendor_tier filter ('1', '2', or NULL)
--   $3: target_region ('us-east-1', or NULL)
--   $4: k_rrf constant (typically 60)
--   $5: match_limit (e.g. 5)
-- ============================================================================

-- Ensure query runtime uses high HNSW search recall:
SET LOCAL hnsw.ef_search = 100;

WITH filtered_entities AS (
    -- Step 1: Relational filtering on Master Data & Taxonomy
    SELECT 
        a.id AS asset_id,
        a.name AS asset_name,
        a.type AS asset_type,
        a.region AS asset_region,
        v.id AS vendor_id,
        v.name AS vendor_name,
        v.tier AS vendor_tier,
        v.contract_status,
        bu.name AS bu_name,
        bu.cost_center
    FROM assets a
    JOIN vendors v ON a.vendor_id = v.id
    JOIN business_units bu ON a.business_unit_id = bu.id
    WHERE ($2::vendor_tier_enum IS NULL OR v.tier = $2)
      AND ($3::VARCHAR IS NULL OR a.region = $3)
),
graph_traversal AS (
    -- Step 2: Multi-Hop Relationship Mapping (Vendor -> Asset -> BU -> Incident)
    SELECT 
        fe.asset_id,
        fe.asset_name,
        fe.vendor_name,
        fe.bu_name,
        COUNT(inc.id) AS incident_count,
        STRING_AGG(inc.severity || ': ' || inc.title, ' | ') AS incident_summary,
        ROW_NUMBER() OVER (
            ORDER BY COUNT(CASE WHEN inc.severity = 'SEV-1' THEN 1 END) DESC, 
                     COUNT(inc.id) DESC
        ) AS graph_rank
    FROM filtered_entities fe
    LEFT JOIN incidents inc ON fe.asset_id = inc.asset_id
    GROUP BY fe.asset_id, fe.asset_name, fe.vendor_name, fe.bu_name
),
vector_candidates AS (
    -- Step 3: pgvector Cosine Distance Search (<=> operator uses HNSW index)
    SELECT 
        kc.id AS chunk_id,
        kc.asset_id,
        kc.document_title,
        kc.chunk_text,
        kc.metadata,
        1 - (kc.embedding <=> $1::vector) AS cosine_similarity,
        ROW_NUMBER() OVER (ORDER BY kc.embedding <=> $1::vector) AS vector_rank
    FROM knowledge_chunks kc
    JOIN filtered_entities fe ON kc.asset_id = fe.asset_id
    ORDER BY kc.embedding <=> $1::vector ASC
    LIMIT 25
)
-- Step 4: Reciprocal Rank Fusion (RRF)
SELECT 
    vc.chunk_id,
    vc.document_title,
    vc.chunk_text,
    vc.cosine_similarity,
    vc.vector_rank,
    gt.asset_name,
    gt.vendor_name,
    gt.bu_name,
    gt.incident_summary,
    gt.graph_rank,
    -- Reciprocal Rank Fusion Formula: 1/(k + rank_vec) + 1/(k + rank_graph)
    ( (1.0 / ($4 + vc.vector_rank)) + (1.0 / ($4 + gt.graph_rank)) ) AS rrf_score
FROM vector_candidates vc
JOIN graph_traversal gt ON vc.asset_id = gt.asset_id
ORDER BY rrf_score DESC
LIMIT $5;
`;

export const PRODUCTION_FASTAPI_CODE = `"""
main.py - Enterprise IT Asset Semantic Knowledge Engine API
FastAPI + asyncpg + Ollama nomic-embed-text + Reciprocal Rank Fusion
"""
from __future__ import annotations
import os
import time
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
import asyncpg
import httpx

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/enterprise_kg")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")

class DatabasePool:
    pool: Optional[asyncpg.Pool] = None

db = DatabasePool()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize asyncpg connection pool with custom vector codec registration
    db.pool = await asyncpg.create_pool(
        dsn=DATABASE_URL,
        min_size=5,
        max_size=20,
        command_timeout=30.0,
    )
    yield
    if db.pool:
        await db.pool.close()

app = FastAPI(
    title="Enterprise IT Asset & Vendor Semantic Knowledge Engine",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class QueryRequest(BaseModel):
    query: str = Field(..., example="Which Tier-1 database vendors have assets in us-east-1 affected by SEV-1 incidents?")
    vendor_tier: Optional[str] = Field(None, description="Optional filter: '1', '2', '3'")
    region: Optional[str] = Field(None, description="Optional region filter: e.g. 'us-east-1'")
    top_k: int = Field(5, ge=1, le=20)
    k_rrf: int = Field(60, ge=1, le=100, description="RRF constant (typically 60)")

class ChunkResult(BaseModel):
    chunk_id: str
    document_title: str
    chunk_text: str
    cosine_similarity: float
    vector_rank: int
    asset_name: str
    vendor_name: str
    bu_name: str
    incident_summary: Optional[str]
    graph_rank: int
    rrf_score: float

class HybridQueryResponse(BaseModel):
    query: str
    execution_time_ms: float
    embedding_time_ms: float
    retrieval_time_ms: float
    results: List[ChunkResult]
    grounded_context_preview: str

# ---------------------------------------------------------------------------
# Embedding Generator via Ollama (nomic-embed-text)
# ---------------------------------------------------------------------------
async def generate_dense_embedding(text: str) -> List[float]:
    start = time.perf_counter()
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{OLLAMA_HOST}/api/embeddings",
            json={"model": "nomic-embed-text", "prompt": text},
        )
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to generate embedding from Ollama")
        data = response.json()
        return data["embedding"]

# ---------------------------------------------------------------------------
# Endpoint: Hybrid Retrieval & Grounded Context Assembly
# ---------------------------------------------------------------------------
@app.post("/api/v1/query", response_model=HybridQueryResponse)
async def hybrid_query_endpoint(req: QueryRequest):
    t0 = time.perf_counter()

    # 1. Generate 768-dim embedding
    t_embed_start = time.perf_counter()
    embedding = await generate_dense_embedding(req.query)
    embed_ms = (time.perf_counter() - t_embed_start) * 1000

    # 2. Execute Hybrid CTE Query in asyncpg
    t_ret_start = time.perf_counter()
    embedding_str = "[" + ",".join(map(str, embedding)) + "]"

    query_sql = """
    SET LOCAL hnsw.ef_search = 100;
    WITH filtered_entities AS (
        SELECT a.id AS asset_id, a.name AS asset_name, v.name AS vendor_name, bu.name AS bu_name
        FROM assets a
        JOIN vendors v ON a.vendor_id = v.id
        JOIN business_units bu ON a.business_unit_id = bu.id
        WHERE ($2::vendor_tier_enum IS NULL OR v.tier = $2)
          AND ($3::VARCHAR IS NULL OR a.region = $3)
    ),
    graph_traversal AS (
        SELECT fe.asset_id, fe.asset_name, fe.vendor_name, fe.bu_name,
               STRING_AGG(inc.severity || ': ' || inc.title, ' | ') AS incident_summary,
               ROW_NUMBER() OVER (ORDER BY COUNT(CASE WHEN inc.severity = 'SEV-1' THEN 1 END) DESC) AS graph_rank
        FROM filtered_entities fe
        LEFT JOIN incidents inc ON fe.asset_id = inc.asset_id
        GROUP BY fe.asset_id, fe.asset_name, fe.vendor_name, fe.bu_name
    ),
    vector_candidates AS (
        SELECT kc.id AS chunk_id, kc.asset_id, kc.document_title, kc.chunk_text,
               1 - (kc.embedding <=> $1::vector) AS cosine_similarity,
               ROW_NUMBER() OVER (ORDER BY kc.embedding <=> $1::vector) AS vector_rank
        FROM knowledge_chunks kc
        JOIN filtered_entities fe ON kc.asset_id = fe.asset_id
        ORDER BY kc.embedding <=> $1::vector ASC
        LIMIT 25
    )
    SELECT vc.chunk_id::text, vc.document_title, vc.chunk_text,
           ROUND(vc.cosine_similarity::numeric, 4) AS cosine_similarity,
           vc.vector_rank, gt.asset_name, gt.vendor_name, gt.bu_name,
           gt.incident_summary, gt.graph_rank,
           ROUND(((1.0 / ($4 + vc.vector_rank)) + (1.0 / ($4 + gt.graph_rank)))::numeric, 6) AS rrf_score
    FROM vector_candidates vc
    JOIN graph_traversal gt ON vc.asset_id = gt.asset_id
    ORDER BY rrf_score DESC
    LIMIT $5;
    """

    assert db.pool is not None, "Database connection pool is not ready"
    async with db.pool.acquire() as conn:
        records = await conn.fetch(
            query_sql,
            embedding_str,
            req.vendor_tier,
            req.region,
            req.k_rrf,
            req.top_k,
        )
    ret_ms = (time.perf_counter() - t_ret_start) * 1000
    total_ms = (time.perf_counter() - t0) * 1000

    results = [
        ChunkResult(
            chunk_id=r["chunk_id"],
            document_title=r["document_title"],
            chunk_text=r["chunk_text"],
            cosine_similarity=float(r["cosine_similarity"]),
            vector_rank=int(r["vector_rank"]),
            asset_name=r["asset_name"],
            vendor_name=r["vendor_name"],
            bu_name=r["bu_name"],
            incident_summary=r["incident_summary"],
            graph_rank=int(r["graph_rank"]),
            rrf_score=float(r["rrf_score"]),
        )
        for r in records
    ]

    # 3. Construct Grounded Prompt Context
    grounded_context = "\\n\\n".join([
        f"--- Document Source: {r.document_title} (Vendor: {r.vendor_name}, Asset: {r.asset_name}, BU: {r.bu_name}) ---\\n"
        f"{r.chunk_text}\\n"
        f"Incident Provenance: {r.incident_summary or 'No active incidents'}"
        for r in results
    ])

    return HybridQueryResponse(
        query=req.query,
        execution_time_ms=round(total_ms, 2),
        embedding_time_ms=round(embed_ms, 2),
        retrieval_time_ms=round(ret_ms, 2),
        results=results,
        grounded_context_preview=grounded_context,
    )
`;
