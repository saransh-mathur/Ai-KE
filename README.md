# Enterprise IT Asset & Vendor Semantic Knowledge Engine

An enterprise-grade **Hybrid Retrieval-Augmented Generation (Hybrid RAG)** platform combining **PostgreSQL 16 Relational Master Data**, **pgvector HNSW Semantic Search**, **Multi-Hop Graph CTE Traversal**, **Reciprocal Rank Fusion (RRF)**, **RBAC Vector Pre-Filtering**, **RLHF Feedback Loops**, **Real-Time Incident Webhooks**, and **Multi-Modal Architecture Diagram Vision Parsing**.

---

## Why This Exists (Problem & Solution)

Pure vector search (standard RAG) fails on enterprise IT infrastructure queries because:
1. **Relational boundaries are ignored** — Semantic search often surfaces expired vendor contracts, wrong cloud regions, or mismatched asset types.
2. **Multi-hop entity chains break** — No single text document mentions all four hops: `[Vendor] → [Asset] → [Business Unit] → [Incident Post-Mortem]`.
3. **Security leaks occur** — Low-clearance users can accidentally retrieve top-secret security post-mortems if filtering happens *after* vector matching.

This engine solves all three by executing **RBAC + SQL relational pre-filtering**, **multi-hop graph CTE joins**, and **pgvector semantic ranking** inside a single deterministic retrieval flow, ranked via **Reciprocal Rank Fusion (`k = 60` + RLHF weights)** before grounding the LLM answer.

---

## End-to-End Project Flow

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. FRONTEND COCKPIT (React 19 + Tailwind CSS v4, Light / Dark Theme)        │
│    • Natural language query + Region / Asset Type / Vendor Tier filters      │
│    • RBAC Clearance Selector (L1 Public → L2 Internal → L3 Restricted)       │
│    • AI Provider Selector (Gemini API | Online OpenAI-Compat | Local Ollama) │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 2. HYBRID RETRIEVAL & RBAC PRE-FILTERING ENGINE (src/lib/retrieval-engine.ts)│
│    Step A — RBAC Pre-Filter: Prunes chunks exceeding user's clearance level  │
│    Step B — Relational Filter: Narrows entities by Region, Asset Type, Tier  │
│    Step C — Graph CTE Traversal: Maps Vendor → Asset → Business Unit → Inc.  │
│    Step D — Vector Similarity + RRF (k=60): Merges semantic & graph ranks    │
│             augmented by live RLHF document weight adjustments               │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 3. EXPRESS API PROXY & AI ORCHESTRATOR (server.ts — Port 3000)               │
│    • /api/generate-ai-answer: Grounds the prompt with ONLY RRF-verified      │
│      chunks & graph paths (Zero-Hallucination Guardrails)                    │
│    • Routes to:                                                              │
│      1) Google Gemini API (`GEMINI_API_KEY`)                                 │
│      2) Any Online OpenAI-Compatible API (`CUSTOM_AI_*` env vars)            │
│      3) Local Ollama (`OLLAMA_HOST` + `nomic-embed-text` + `llama3`/`mistral`)│
│      4) Deterministic Grounded Synthesizer (zero-dependency fallback)        │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ 4. PERSISTENCE, FEEDBACK, WEBHOOKS & VISION STUDIO (PostgreSQL + Drizzle)    │
│    • /api/feedback: Thumbs Up / Down re-weights RRF chunk scores in real time│
│    • /api/webhooks/incidents: Live PagerDuty / CloudWatch / Jira ingestion   │
│    • /api/multimodal/parse-diagram: Vision-LLM extracts topology nodes/edges │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Feature Modules
1. **Knowledge Search (`DeveloperCockpit`)**: Query input + 3 clean filters (`Target Region`, `Vendor Tier`, `Security Clearance`), Grounded AI Answer with RLHF Thumbs Up/Down feedback, and an expandable **Retrieval Trace** featuring an **interactive D3.js multi-hop knowledge graph**, 4-node relationship chain (`Vendor → Asset → Business Unit → Incident`), and matched vector chunk.
2. **Live Database (`LiveDatabaseExplorer`)**: Live PostgreSQL table inspector over `vendors`, `assets`, `business_units`, `incidents`, `knowledge_chunks`, and `saved_queries` with one-click **Seed Demo Data**.
3. **Schema & SQL (`SchemaViewer`)**: Reference viewer for `pgvector` HNSW DDL, single-pass RRF SQL queries, SQLAlchemy models, Table Dictionary, and global `Cmd+S` / `Ctrl+S` JSON report export.

---

## Quick Start & Installation

### 1. Prerequisites
- **Node.js 20+** and `npm`
- **Docker Desktop** *(recommended — zero manual Postgres install)* **OR** an existing **PostgreSQL 15/16+** instance (local or hosted such as Neon, Supabase, RDS, or Cloud SQL)
- *(Optional for local AI)* **Ollama** installed locally

### 2. Clone & Install Dependencies
```bash
git clone <your-repo-url>
cd <your-repo-directory>
npm install
```

### 3. One-Command PostgreSQL Database Setup
Once the repository is copied, run a single command to bootstrap `.env`, provision/connect PostgreSQL + `pgvector`, create tables/indexes/views, and seed the enterprise dataset:
```bash
npm run db:setup
```

**What `npm run db:setup` automates end-to-end:**
1. Creates `.env` from `.env.example` if missing.
2. If no local Postgres is running on `SQL_HOST:SQL_PORT` and Docker is available, automatically starts the `pgvector/pgvector:pg16` container defined in `docker-compose.yml`.
3. Creates database `ai_knowledge_engine` if it doesn't exist yet.
4. Runs `db/init.sql` (idempotent tables, foreign keys, B-tree + GIN indexes, `pg_trgm`, `pgvector` + HNSW index when installed, and the `v_enterprise_knowledge_graph` view).
5. Seeds `vendors`, `business_units`, `assets`, `incidents`, and `knowledge_chunks` idempotently and verifies row counts.

> **Using an existing remote Postgres (Neon, Supabase, RDS)?** Copy `.env.example` to `.env`, set `SQL_HOST`, `SQL_PORT`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, and `SQL_SSL="true"`, then run `npm run db:setup`.

> **Security Note:** Never commit `.env` or `firebase-applet-config.json` to Git. All API keys and database credentials are loaded strictly server-side.

### 4. Start the Application
```bash
npm run dev
```
Open `http://localhost:3000`. The **Knowledge Search** (`/api/hybrid-search`) and **Live Database** (`/api/vendors`, `/api/assets`, `/api/incidents`, `/api/knowledge-chunks`) tabs are connected end-to-end to PostgreSQL immediately.

### Useful Database Commands
```bash
npm run db:setup   # Full one-command setup (env + Docker/DB + schema + indexes + seed)
npm run db:push    # Push Drizzle schema changes (src/db/schema.ts)
npm run db:seed    # Re-run idempotent enterprise seed data
npm run db:studio  # Open Drizzle Studio GUI against PostgreSQL
```

---

## AI Setup Guide (Local LLM & Online API Keys)

This application supports **three AI modes** switchable from the Search Cockpit **Filters → AI Synthesis Engine** dropdown.

---

### Option A: 100% Free & Offline with Local LLM + Embeddings (Ollama)

Run everything on your own machine with zero cloud egress and zero API costs.

1. **Install Ollama** from [ollama.com](https://ollama.com).
2. **Pull a local embedding model and chat model:**
   ```bash
   # Recommended 768-dimension embedding model (matches schema `vector(768)`)
   ollama pull nomic-embed-text

   # Pull one (or more) local chat LLMs
   ollama pull llama3
   # Alternatives: ollama pull mistral | ollama pull qwen2.5:7b
   ```
3. **Verify Ollama is running:**
   ```bash
   ollama list
   # Default server listens on http://localhost:11434
   ```
4. **Configure `.env`:**
   ```env
   OLLAMA_HOST="http://localhost:11434"
   ```
5. **Run a query:**
   - Open `http://localhost:3000`
   - Click **Filters** in the Search Cockpit
   - Select **`Local Ollama (llama3 / mistral)`** under **AI Synthesis Engine**
   - You can also inspect real-time Ollama embedding calls via `/api/ollama/embed`.

---

### Option B: Online API Key — Google Gemini

Recommended for both grounded text synthesis and **Multi-Modal Vision Studio** diagram parsing.

1. Generate a key in Google AI Studio.
2. Set `GEMINI_API_KEY` in `.env`:
   ```env
   GEMINI_API_KEY="AIzaSyYourGeminiKeyHere"
   ```
3. Restart `npm run dev` and keep **AI Synthesis Engine** set to **`Google Gemini 3.8 Flash`**.

---

### Option C: Online API Key — Any Other AI Provider (OpenAI, Groq, OpenRouter, DeepSeek, Together, etc.)

All OpenAI-compatible REST APIs work out of the box through the secure server-side proxy at `/api/generate-ai-answer`.

1. Open `.env` and configure the three `CUSTOM_AI_*` variables:
   ```env
   CUSTOM_AI_API_KEY="your-provider-api-key"
   CUSTOM_AI_BASE_URL="https://api.openai.com/v1"
   CUSTOM_AI_MODEL="gpt-4o-mini"
   ```

2. Use these verified presets for popular providers:

   | Provider | `CUSTOM_AI_BASE_URL` | Example `CUSTOM_AI_MODEL` |
   | :--- | :--- | :--- |
   | **OpenAI** | `https://api.openai.com/v1` | `gpt-4o-mini` or `gpt-4o` |
   | **Groq** | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
   | **OpenRouter** | `https://openrouter.ai/api/v1` | `anthropic/claude-3.5-sonnet` |
   | **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat` |
   | **Together AI** | `https://api.together.xyz/v1` | `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo` |

3. Restart `npm run dev`, open **Filters** in the Search Cockpit, and choose **`Online Custom AI (OpenAI / Groq / OpenRouter)`**.

---

## Optional: Authentication & Google SSO Setup

By default, **Google SSO is disabled when unconfigured** so public forks never leak OAuth client IDs or redirect URLs, and users can explore immediately in **Demo Mode**.

To enable real Google Sign-In in your own fork:
1. Create your own Firebase project in the Firebase Console and enable **Google Sign-In**.
2. Add your own `localhost` / deployment domain under **Firebase Authentication → Settings → Authorized Domains**.
3. Copy the template config or use `.env` variables:
   ```bash
   cp firebase-applet-config.example.json firebase-applet-config.json
   ```
   Fill in your own `apiKey`, `authDomain`, `projectId`, and `appId` (never commit `firebase-applet-config.json`).

---

## Scripts & Verification

```bash
# Run development server (Express API + Vite frontend on port 3000)
npm run dev

# Run TypeScript type checking
npm run lint

# Build production bundle
npm run build

# Run retrieval engine, RRF, and RBAC unit tests
npx tsx --test src/lib/*.test.ts
```
