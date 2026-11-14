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
1. **Search Cockpit (`Search`)**: Minimalist AI interface with collapsible Advanced Filters, RBAC security clearance enforcement, Grounded AI Answer with Thumbs Up/Down RLHF reinforcement, and an **"Under the Hood: Retrieval Proof"** accordion showing Multi-Hop Graph Paths, Ranked Vector Chunks, and Executed SQL CTEs.
2. **Webhooks (`Webhooks`)**: Simulates and persists live PagerDuty, AWS CloudWatch, and Jira incident alerts into PostgreSQL with zero-ETL chunk generation.
3. **Vision Studio (`Vision Studio`)**: Parses visual architecture diagrams (uploads or presets) into queryable graph nodes, directed edges, and SLA bottleneck warnings.
4. **Database Explorer (`Database`)**: Live inspector over `vendors`, `assets`, `incidents`, `knowledge_chunks`, and `saved_queries`.
5. **Architecture & DDL (`Architecture`)**: Interactive 4-layer architecture blueprint, PostgreSQL 16 + `pgvector` DDL, SQLAlchemy 2.0 Async models, Graph Explorer, and downloadable JSON snapshots.

---

## Quick Start & Installation

### 1. Prerequisites
- **Node.js 20+** and `npm`
- **PostgreSQL 15/16+** (with `pgvector` extension if using vector indexes in Postgres)
- *(Optional for local AI)* **Ollama** installed locally

### 2. Clone & Install Dependencies
```bash
git clone <your-repo-url>
cd <your-repo-directory>
npm install
```

### 3. Configure Environment Variables
Copy the environment template and fill in your credentials:
```bash
cp .env.example .env
```

> **Security Note:** Never commit `.env` or `firebase-applet-config.json` to Git. All API keys are loaded strictly server-side in `server.ts`—never exposed in browser code.

### 4. Push Database Schema & Start
```bash
# Push Drizzle PostgreSQL schema (when DATABASE_URL is configured)
npx drizzle-kit push

# Start full-stack Express + Vite server on http://localhost:3000
npm run dev
```

On startup, the backend automatically checks PostgreSQL connectivity and seeds initial master data if tables are empty. If PostgreSQL is unavailable locally, the cockpit still demonstrates hybrid retrieval using seeded in-memory records.

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
