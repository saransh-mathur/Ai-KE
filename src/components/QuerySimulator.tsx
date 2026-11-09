import React, { useState, useMemo, useEffect } from 'react';
import { Search, Sparkles, Filter, GitFork, Binary, Layers, ArrowRight, ShieldAlert, CheckCircle, FileText, ChevronDown, ChevronUp, Database, History, Save } from 'lucide-react';
import { parseNaturalLanguageQuery, executeHybridRetrieval, QueryAnalysis } from '../lib/hybrid-search.ts';
import { HybridSearchResult } from '../lib/types.ts';
import { useAuth } from '../context/AuthContext.tsx';

const SAMPLE_QUERIES = [
  {
    title: 'Tier-1 Database Incident Root Cause',
    query: 'Which Tier-1 database vendors have assets in us-east-1 affected by critical SEV-1 incidents, and what do our post-mortems say about root causes?',
  },
  {
    title: 'High Availability & Failover Protocol',
    query: 'What is the automated failover runbook protocol for PostgreSQL database assets in us-east-1?',
  },
  {
    title: 'Storage Vendor SLA & Hardware',
    query: 'Find NVMe storage assets from active contract vendors supporting Payment Processing and review their hardware SLA.',
  },
  {
    title: 'Network Switch Incident & Contract Review',
    query: 'Which network switches in us-west-2 experienced BGP flap incidents and what is their vendor contract status?',
  },
];

export const QuerySimulator: React.FC = () => {
  const { user, idToken } = useAuth();
  const [queryInput, setQueryInput] = useState<string>(SAMPLE_QUERIES[0].query);
  const [retrievalMode, setRetrievalMode] = useState<'hybrid' | 'vector_only' | 'sql_only'>('hybrid');
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>('chk-001');
  const [persisting, setPersisting] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [recentAudits, setRecentAudits] = useState<any[]>([]);

  // Compute live analysis and retrieval
  const queryAnalysis: QueryAnalysis = useMemo(() => {
    return parseNaturalLanguageQuery(queryInput);
  }, [queryInput]);

  const results: HybridSearchResult[] = useMemo(() => {
    return executeHybridRetrieval(queryInput, queryAnalysis, {
      applySqlFilters: retrievalMode !== 'vector_only',
      useGraphRank: retrievalMode !== 'vector_only',
    });
  }, [queryInput, queryAnalysis, retrievalMode]);

  // Fetch recent queries from Cloud SQL
  const loadRecentAudits = async () => {
    try {
      const res = await fetch('/api/saved-queries');
      if (res.ok) {
        const json = await res.json();
        setRecentAudits(json);
      }
    } catch (e) {
      console.error('Failed to load recent audits:', e);
    }
  };

  useEffect(() => {
    loadRecentAudits();
  }, []);

  // Save query execution into Cloud SQL
  const handleSaveToCloudSql = async () => {
    setPersisting(true);
    try {
      const topRes = results[0];
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const res = await fetch('/api/saved-queries', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          queryText: queryInput,
          filtersApplied: queryAnalysis.extractedFilters,
          topResultDoc: topRes ? topRes.chunk.document_title : null,
          rrfScore: topRes ? topRes.rrfScore : null,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        loadRecentAudits();
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (e) {
      console.error('Failed to save query to Cloud SQL:', e);
    } finally {
      setPersisting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Header & Prompt Input */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Hybrid Retrieval &amp; Query Router Simulator</h2>
          </div>

          {/* Retrieval Mode Toggle */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setRetrievalMode('hybrid')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                retrievalMode === 'hybrid'
                  ? 'bg-indigo-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hybrid (SQL + Graph + Vector)
            </button>
            <button
              onClick={() => setRetrievalMode('vector_only')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                retrievalMode === 'vector_only'
                  ? 'bg-amber-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Disables relational and graph constraints to expose pure vector blindspots"
            >
              Pure Vector Only
            </button>
          </div>
        </div>

        {/* Input box */}
        <div className="relative mb-3">
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Ask a question about IT assets, vendors, SLA terms, or incident post-mortems..."
            className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl pl-11 pr-28 py-3.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner"
          />
          <Search className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <button
              onClick={handleSaveToCloudSql}
              disabled={persisting}
              title="Record execution to Cloud SQL audit log"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors border border-slate-700 flex items-center gap-1"
            >
              <Save className="w-3.5 h-3.5 text-emerald-400" />
              <span>{saveSuccess ? 'Saved!' : 'Log SQL'}</span>
            </button>
          </div>
        </div>

        {/* Sample query pills */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400">Sample Prompts:</span>
          {SAMPLE_QUERIES.map((sq, idx) => (
            <button
              key={idx}
              onClick={() => setQueryInput(sq.query)}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition-all text-left"
            >
              {sq.title}
            </button>
          ))}
        </div>
      </div>

      {/* Query Router Live Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1: SQL Filter Extraction */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              1. SQL Filter Extraction
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
              Deterministic
            </span>
          </div>
          {Object.keys(queryAnalysis.extractedFilters).length > 0 ? (
            <div className="space-y-1.5 text-xs font-mono bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              {queryAnalysis.extractedFilters.vendorTier && (
                <div className="text-blue-300">WHERE v.tier = '{queryAnalysis.extractedFilters.vendorTier}'</div>
              )}
              {queryAnalysis.extractedFilters.contractStatus && (
                <div className="text-blue-300">AND v.contract_status = '{queryAnalysis.extractedFilters.contractStatus}'</div>
              )}
              {queryAnalysis.extractedFilters.region && (
                <div className="text-blue-300">AND a.region = '{queryAnalysis.extractedFilters.region}'</div>
              )}
              {queryAnalysis.extractedFilters.assetType && (
                <div className="text-blue-300">AND a.type = '{queryAnalysis.extractedFilters.assetType}'</div>
              )}
              {queryAnalysis.extractedFilters.severity && (
                <div className="text-rose-300">AND inc.severity = '{queryAnalysis.extractedFilters.severity}'</div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              No restrictive metadata predicates extracted. Scanning across all active assets.
            </p>
          )}
        </div>

        {/* Step 2: Multi-Hop Graph Traversal */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <GitFork className="w-3.5 h-3.5" />
              2. Graph Dependency Path
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400">
              Multi-Hop CTE
            </span>
          </div>
          <div className="text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
            <div className="text-purple-300 font-mono text-[11px]">
              [Vendor] &rarr; [Asset] &rarr; [BU] &rarr; [Incident]
            </div>
            <p className="text-slate-400 text-xs">
              Correlates master vendor contracts to live incident logs &amp; financial cost centers.
            </p>
          </div>
        </div>

        {/* Step 3: pgvector HNSW Search */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Binary className="w-3.5 h-3.5" />
              3. pgvector Dense Match
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              nomic-embed-text
            </span>
          </div>
          <div className="text-xs bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
            <div className="text-emerald-300 font-mono text-[11px]">
              vector_cosine_ops (&lt;=&gt;) &bull; 768 dims
            </div>
            <p className="text-slate-400 text-xs">
              HNSW search with <code className="text-emerald-400 font-mono">ef_search = 100</code> on documentation &amp; post-mortems.
            </p>
          </div>
        </div>
      </div>

      {/* Reciprocal Rank Fusion Results */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Ranked Knowledge Chunks (Reciprocal Rank Fusion k=60)
            </h3>
            <p className="text-xs text-slate-400">
              Formula: <code className="text-indigo-300 font-mono">RRF = 1/(60 + Vector_Rank) + 1/(60 + Graph_Rank)</code>
            </p>
          </div>
          <div className="text-xs font-mono text-slate-400">
            {results.length} Candidates Retrieved
          </div>
        </div>

        {/* Results List */}
        <div className="space-y-3">
          {results.map((res, index) => {
            const isExpanded = expandedChunkId === res.chunk.id;
            return (
              <div
                key={res.chunk.id}
                className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 transition-all hover:border-slate-700"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-xs flex items-center justify-center font-bold shrink-0">
                      #{index + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{res.chunk.document_title}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {res.chunk.doc_type}
                        </span>
                        {res.incident && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            {res.incident.severity}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>Vendor: <strong className="text-slate-200">{res.vendor.name}</strong> (Tier {res.vendor.tier})</span>
                        <span>&bull;</span>
                        <span>Asset: <strong className="text-slate-200">{res.asset.name}</strong></span>
                        <span>&bull;</span>
                        <span>BU: <strong className="text-slate-200">{res.businessUnit.name}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Scores breakdown badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-indigo-400">
                        RRF: {res.rrfScore.toFixed(5)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        V-Rank #{res.vectorRank} (Sim: {(res.vectorSimilarity * 100).toFixed(1)}%) | G-Rank #{res.graphRank}
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedChunkId(isExpanded ? null : res.chunk.id)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                      aria-label="Toggle details"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Multi-Hop Path Ribbon */}
                <div className="mt-3 pt-3 border-t border-slate-850 flex items-center gap-1.5 flex-wrap text-[11px] font-mono text-slate-400">
                  <span className="text-slate-500">Hop Path:</span>
                  {res.hopPath.map((hop, hIdx) => (
                    <span key={hIdx} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                      {hop}
                    </span>
                  ))}
                </div>

                {/* Expanded Chunk Text */}
                {isExpanded && (
                  <div className="mt-4 pt-3 border-t border-slate-800 space-y-3">
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
                      <span className="text-[11px] font-mono text-slate-400 block mb-1">Passage Text (Embedding Corpus Source):</span>
                      <p className="text-xs text-slate-200 leading-relaxed font-sans">
                        {res.chunk.chunk_text}
                      </p>
                    </div>

                    {res.incident && (
                      <div className="bg-rose-950/20 border border-rose-900/40 p-3.5 rounded-xl text-xs space-y-1">
                        <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Correlated Incident Root Cause ({res.incident.title})
                        </div>
                        <p className="text-slate-300 text-xs">
                          {res.incident.root_cause} (Downtime: {res.incident.downtime_minutes} mins)
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Grounded LLM Prompt Assembly Preview */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Synthesized Grounded Context (Prompt Payload)</h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Ready for LLM generation with zero hallucination
          </span>
        </div>

        <pre className="text-xs font-mono p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 overflow-x-auto leading-relaxed max-h-56">
          <code>
{`[SYSTEM INSTRUCTION]
You are an Enterprise IT Architecture Assistant. Answer exclusively using the verified enterprise knowledge graph and document excerpts below. Cite source documents and incident IDs for every factual claim.

[GROUNDED CONTEXT]
${results.slice(0, 3).map((r, i) => `--- Citation [${i + 1}]: ${r.chunk.document_title} ---
Vendor: ${r.vendor.name} (Tier ${r.vendor.tier}, Contract: ${r.vendor.contract_status})
Asset: ${r.asset.name} (${r.asset.type}, Region: ${r.asset.region})
Business Unit: ${r.businessUnit.name} (Cost Center: ${r.businessUnit.cost_center})
${r.incident ? `Incident: ${r.incident.title} [${r.incident.severity}] - Root Cause: ${r.incident.root_cause}` : ''}
Excerpt:
${r.chunk.chunk_text}`).join('\n\n')}

[USER QUERY]
${queryInput}`}
          </code>
        </pre>
      </div>

      {/* Recent Cloud SQL Audit Trail */}
      {recentAudits.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Cloud SQL Query Audit Trail (saved_queries table)</h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Live from PostgreSQL
            </span>
          </div>

          <div className="space-y-2">
            {recentAudits.slice(0, 5).map((audit, aIdx) => (
              <div key={aIdx} className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-slate-300 truncate font-mono">{audit.query_text}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 shrink-0">
                  <span className="text-indigo-400">RRF: {audit.rrf_score?.toFixed(5) || 'N/A'}</span>
                  <span>{audit.user_email}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
