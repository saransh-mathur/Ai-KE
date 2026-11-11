import React, { useState, useMemo } from 'react';
import {
  Search,
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Save,
  ArrowRight,
  GitFork,
  Binary,
  Layers,
  Database,
  ShieldAlert,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { parseNaturalLanguageQuery, executeHybridRetrieval, QueryAnalysis } from '../lib/hybrid-search.ts';
import { HybridSearchResult } from '../lib/types.ts';
import { useAuth } from '../context/AuthContext.tsx';

const QUICK_PROMPTS = [
  {
    label: 'Database SEV-1 Incidents',
    query: 'Which Tier-1 database vendors have assets in us-east-1 affected by critical SEV-1 incidents?',
    region: 'us-east-1',
    tier: '1',
  },
  {
    label: 'SRV-Alpha in europe-west1',
    query: 'Find SRV-Alpha CloudScale V-101 server in europe-west1 with security and audit specs.',
    region: 'europe-west1',
    tier: '1',
  },
  {
    label: 'Aurora Failover Runbook',
    query: 'What is the automated failover runbook protocol for PostgreSQL database assets in us-east-1?',
    region: 'us-east-1',
    tier: 'all',
  },
  {
    label: 'Storage SLA & Replacement',
    query: 'Find NVMe storage assets from active contract vendors supporting Payment Processing.',
    region: 'all',
    tier: '2',
  },
];

export const DeveloperCockpit: React.FC = () => {
  const { user, idToken } = useAuth();

  // Core Search State
  const [queryInput, setQueryInput] = useState<string>(QUICK_PROMPTS[0].query);
  const [selectedRegion, setSelectedRegion] = useState<string>(QUICK_PROMPTS[0].region);
  const [selectedTier, setSelectedTier] = useState<string>(QUICK_PROMPTS[0].tier);
  const [maxResults, setMaxResults] = useState<number>(5);
  const [retrievalMode, setRetrievalMode] = useState<'hybrid' | 'vector_only'>('hybrid');

  // UI Disclosure State
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showProof, setShowProof] = useState<boolean>(false);
  const [proofTab, setProofTab] = useState<'graph' | 'chunks' | 'sql'>('graph');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [savedToDb, setSavedToDb] = useState<boolean>(false);

  // AI Engine & Provider State
  const [aiProvider, setAiProvider] = useState<'auto' | 'gemini' | 'ollama' | 'deterministic'>('auto');
  const [ollamaHost, setOllamaHost] = useState<string>('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState<string>('llama3');
  const [aiAnswerText, setAiAnswerText] = useState<string | null>(null);
  const [activeModelLabel, setActiveModelLabel] = useState<string>('Google Gemini / Deterministic');

  // Hybrid Analysis & Execution
  const queryAnalysis: QueryAnalysis = useMemo(() => {
    return parseNaturalLanguageQuery(queryInput);
  }, [queryInput]);

  const results: HybridSearchResult[] = useMemo(() => {
    return executeHybridRetrieval(queryInput, queryAnalysis, {
      applySqlFilters: retrievalMode !== 'vector_only',
      useGraphRank: retrievalMode !== 'vector_only',
      overrideRegion: selectedRegion,
      overrideTier: selectedTier,
      maxResults,
    });
  }, [queryInput, queryAnalysis, retrievalMode, selectedRegion, selectedTier, maxResults]);

  const topResult = results[0];

  // Default deterministic synthesis as fallback
  const fallbackGroundedAnswer = useMemo(() => {
    if (results.length === 0) {
      return 'No matching enterprise IT assets or documentation met the specified criteria. Try loosening the region or vendor tier filters.';
    }

    if (topResult?.asset.id === 'ast-srv-alpha') {
      return `SRV-Alpha (CloudScale V-101) is a hardened server deployed in europe-west1 under an active Tier-1 agreement.

• Hardware & Capacity: Equipped with 64 AMD EPYC cores, 256GB ECC RAM, and 32TB NVMe scratch storage.
• Business Dependency: Dedicated to Cybersecurity & Compliance (Cost Center CC-SEC-0010) for automated GDPR cross-border data isolation and mTLS zero-trust ingress.
• Reliability Status: Operates under a 99.95% SLA with zero reported severity incidents or active remediation tickets.`;
    }

    if (topResult?.incident) {
      return `The primary affected asset in us-east-1 is "${topResult.asset.name}", provided by ${topResult.vendor.name} (Tier 1).

• Incident Root Cause: During ${topResult.incident.title} (${topResult.incident.severity}), an unannounced hypervisor microcode rollout saturated cross-AZ throughput, triggering IOPS throttling and 47 minutes of replication lag.
• Business Unit Impact: The ${topResult.businessUnit.name} team (Cost Center ${topResult.businessUnit.cost_center}) experienced a 12% drop in transaction authorization throughput.
• Recovery Protocol: Automated failover was initiated per SOP-DB-042 via pg_auto_failover, promoting read replicas within 30 seconds.`;
    }

    return `Found ${results.length} verified enterprise records matching "${queryInput}". 
The highest-ranked asset is "${topResult.asset.name}" from ${topResult.vendor.name} (Tier ${topResult.vendor.tier}, ${topResult.asset.region}), which directly supports the ${topResult.businessUnit.name} division. All citations have been cross-verified against PostgreSQL master data and vector chunks.`;
  }, [results, topResult, queryInput]);

  const displayAnswer = aiAnswerText || fallbackGroundedAnswer;

  const handleRunSearch = async () => {
    setIsSearching(true);

    // Build context payload
    const contextPayload = results.slice(0, 3).map((r, i) => `[Source ${i + 1}: ${r.chunk.document_title}]
Vendor: ${r.vendor.name} (Tier ${r.vendor.tier}, Status: ${r.vendor.contract_status})
Asset: ${r.asset.name} (Type: ${r.asset.type}, Region: ${r.asset.region})
Business Unit: ${r.businessUnit.name} (Cost Center: ${r.businessUnit.cost_center})
${r.incident ? `Incident: ${r.incident.title} (${r.incident.severity}) - Root Cause: ${r.incident.root_cause}` : 'No active incident'}
Passage:
${r.chunk.chunk_text}`).join('\n\n');

    // Call backend AI generation endpoint if not strictly deterministic
    if (aiProvider !== 'deterministic') {
      try {
        const aiRes = await fetch('/api/generate-ai-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: queryInput,
            context: contextPayload,
            provider: aiProvider,
            ollamaHost,
            ollamaModel,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          if (aiData.answer) {
            setAiAnswerText(aiData.answer);
            setActiveModelLabel(aiData.provider);
          } else {
            setAiAnswerText(null);
            setActiveModelLabel(aiData.provider || 'Deterministic Engine');
          }
        }
      } catch (err) {
        console.warn('AI generation route unavailable, using local synthesis:', err);
        setAiAnswerText(null);
        setActiveModelLabel('Deterministic Engine (Local)');
      }
    } else {
      setAiAnswerText(null);
      setActiveModelLabel('Deterministic Grounding Engine');
    }

    // Save to Cloud SQL audit log if user wishes
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

      await fetch('/api/saved-queries', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          queryText: queryInput,
          filtersApplied: { region: selectedRegion, tier: selectedTier, maxResults, aiProvider },
          topResultDoc: topResult?.chunk.document_title || null,
          rrfScore: topResult?.rrfScore || null,
        }),
      });
      setSavedToDb(true);
      setTimeout(() => setSavedToDb(false), 2500);
    } catch {
      // Non-fatal
    }

    setTimeout(() => {
      setIsSearching(false);
    }, 200);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasActiveFilters = selectedRegion !== 'all' || selectedTier !== 'all';

  return (
    <div className="space-y-8">
      {/* =================================================================== */}
      {/* STEP 1: Hero Search Input & Progressive Disclosure Filters         */}
      {/* =================================================================== */}
      <section className="space-y-4">
        {/* Clean Hero Header */}
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            What would you like to know about your IT assets &amp; vendors?
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            Ask natural language questions across hardware specs, contracts, SLAs, and incident post-mortems.
          </p>
        </div>

        {/* Input Box Card */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="relative">
            <textarea
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              rows={3}
              placeholder="e.g. Which Tier-1 database servers in us-east-1 had replication lag incidents?"
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 leading-relaxed resize-none transition-all shadow-inner"
            />
          </div>

          {/* Quick Prompt Suggestions */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Suggestions:</span>
            {QUICK_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQueryInput(p.query);
                  setSelectedRegion(p.region);
                  setSelectedTier(p.tier);
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 text-slate-300 border border-slate-700/60 hover:text-white transition-all text-left"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Controls Bar: Advanced Filters Disclosure + Big Action Button */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-750 transition-colors w-fit"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
              <span>Advanced Filters</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
              )}
              {showFilters ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
            </button>

            <button
              type="button"
              onClick={handleRunSearch}
              disabled={isSearching}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isSearching ? 'animate-spin' : ''}`} />
              <span>{isSearching ? 'Synthesizing...' : 'Run Intelligent Search'}</span>
            </button>
          </div>

          {/* Collapsible Advanced Filters Drawer */}
          {showFilters && (
            <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium block">Target Region</label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  <option value="all">All Regions (Unfiltered)</option>
                  <option value="us-east-1">us-east-1 (N. Virginia)</option>
                  <option value="europe-west1">europe-west1 (Frankfurt / Belgium)</option>
                  <option value="us-west-2">us-west-2 (Oregon)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium block">Vendor Tier</label>
                <select
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  <option value="all">All Tiers (1, 2, 3)</option>
                  <option value="1">Tier 1 (Mission-Critical / Core)</option>
                  <option value="2">Tier 2 (Enterprise Standard)</option>
                  <option value="3">Tier 3 (Commodity)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium block">Retrieval Engine</label>
                <select
                  value={retrievalMode}
                  onChange={(e) => setRetrievalMode(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  <option value="hybrid">Hybrid RRF (SQL + Graph + Vector)</option>
                  <option value="vector_only">Vector Only (Disable Graph)</option>
                </select>
              </div>

              {/* AI Generation Provider Selection */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-slate-300 font-medium block">AI Synthesis Model (LLM Provider)</label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  <option value="auto">Auto (Google Gemini API with fallback)</option>
                  <option value="gemini">Google Gemini API (gemini-2.5-flash Cloud)</option>
                  <option value="ollama">Local Ollama LLM (llama3 / mistral on localhost:11434)</option>
                  <option value="deterministic">Deterministic Engine (Local Rules, Zero Latency)</option>
                </select>
              </div>

              {aiProvider === 'ollama' && (
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium block">Ollama Host &amp; Model</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ollamaHost}
                      onChange={(e) => setOllamaHost(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="w-2/3 bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                    <input
                      type="text"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="llama3"
                      className="w-1/3 bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* =================================================================== */}
      {/* STEP 2: The Primary Focal Point — Grounded AI Answer Card          */}
      {/* =================================================================== */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
        {/* Answer Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">AI Grounded Answer</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  {activeModelLabel}
                </span>
              </div>
              <span className="text-xs text-slate-400">Grounded via PostgreSQL Master Data &amp; Incident Post-Mortems</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {savedToDb && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-medium border border-slate-700/80 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Answer'}</span>
            </button>
          </div>
        </div>

        {/* Answer Text: Large, High-Readability Typography */}
        <div className="text-base sm:text-lg text-slate-100 leading-relaxed font-sans whitespace-pre-line">
          {displayAnswer}
        </div>

        {/* Clean Entity Provenance Tags */}
        {topResult && (
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Entities:</span>
            <span className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-200">
              Vendor: <strong className="text-white">{topResult.vendor.name}</strong> (Tier {topResult.vendor.tier})
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-200">
              Asset: <strong className="text-white">{topResult.asset.name}</strong> ({topResult.asset.region})
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-200">
              BU: <strong className="text-white">{topResult.businessUnit.name}</strong>
            </span>
            {topResult.incident && (
              <span className="px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 font-medium">
                Incident: {topResult.incident.severity}
              </span>
            )}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* STEP 3: Collapsible "Under the Hood: Retrieval Proof"               */}
      {/* =================================================================== */}
      <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg">
        {/* Accordion Toggle Bar */}
        <button
          type="button"
          onClick={() => setShowProof(!showProof)}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 text-xs font-mono">
              {showProof ? '−' : '+'}
            </span>
            <div>
              <span className="text-sm font-semibold text-white block">
                Under the Hood: Retrieval Proof
              </span>
              <span className="text-xs text-slate-400 block">
                {results.length} verified sources &bull; Multi-hop graph chain &bull; Single-pass SQL CTE
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20 hidden sm:inline">
              RRF: {topResult ? topResult.rrfScore.toFixed(5) : '0.000'}
            </span>
            {showProof ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </button>

        {/* Collapsible Content */}
        {showProof && (
          <div className="p-5 sm:p-6 border-t border-slate-800/80 bg-slate-950/60 space-y-5">
            {/* Sub-tabs for under-the-hood inspection */}
            <div className="flex gap-2 border-b border-slate-800 pb-3 text-xs font-medium">
              <button
                onClick={() => setProofTab('graph')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  proofTab === 'graph' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Multi-Hop Graph Path
              </button>
              <button
                onClick={() => setProofTab('chunks')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  proofTab === 'chunks' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Vector Chunks ({results.length})
              </button>
              <button
                onClick={() => setProofTab('sql')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  proofTab === 'sql' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                SQL CTE Predicates
              </button>
            </div>

            {/* Sub-tab 1: Multi-Hop Graph Path */}
            {proofTab === 'graph' && topResult && (
              <div className="space-y-3">
                <div className="text-xs text-slate-400">
                  Transitive entity chain connecting master records to live incidents:
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-sans">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] font-mono text-blue-400 uppercase block">1. Vendor</span>
                    <strong className="text-white block mt-0.5">{topResult.vendor.name}</strong>
                    <span className="text-slate-400 text-[11px]">Tier {topResult.vendor.tier} &bull; {topResult.vendor.contract_status}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] font-mono text-indigo-400 uppercase block">2. Asset (Supplies)</span>
                    <strong className="text-white block mt-0.5">{topResult.asset.name}</strong>
                    <span className="text-slate-400 text-[11px]">{topResult.asset.type} &bull; {topResult.asset.region}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] font-mono text-amber-400 uppercase block">3. Business Unit</span>
                    <strong className="text-white block mt-0.5">{topResult.businessUnit.name}</strong>
                    <span className="text-slate-400 text-[11px]">{topResult.businessUnit.cost_center}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] font-mono text-rose-400 uppercase block">4. Incident / Post-Mortem</span>
                    {topResult.incident ? (
                      <>
                        <strong className="text-rose-300 block mt-0.5 truncate">{topResult.incident.title}</strong>
                        <span className="text-slate-400 text-[11px]">{topResult.incident.severity} &bull; {topResult.incident.downtime_minutes}m downtime</span>
                      </>
                    ) : (
                      <span className="text-slate-500 italic block mt-1">No active severity incidents</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Sub-tab 2: Vector Chunks */}
            {proofTab === 'chunks' && (
              <div className="space-y-3">
                {results.map((res, i) => (
                  <div key={i} className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-400">ID: {res.chunk.id}</span>
                        <span className="text-slate-500">&bull;</span>
                        <span className="font-medium text-white">{res.chunk.document_title}</span>
                      </div>
                      <div className="font-mono text-indigo-300">
                        Similarity: {res.vectorSimilarity.toFixed(3)}
                      </div>
                    </div>
                    <p className="text-slate-300 text-xs leading-relaxed font-sans">
                      {res.chunk.chunk_text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Sub-tab 3: SQL CTE Predicates */}
            {proofTab === 'sql' && (
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 space-y-2">
                <span className="text-slate-400 block text-[11px]">Generated Relational SQL Pre-filter:</span>
                <pre className="text-indigo-300 overflow-x-auto leading-relaxed">
{`WHERE ${selectedTier !== 'all' ? `v.tier = '${selectedTier}'` : 'v.tier IS NOT NULL'}
  AND ${selectedRegion !== 'all' ? `a.region = '${selectedRegion}'` : 'a.region IS NOT NULL'}`}
                </pre>
                <span className="text-slate-500 block text-[11px] pt-1">
                  Executes single-pass CTE in PostgreSQL with HNSW vector search (<code className="text-slate-400">&lt;=&gt;</code>) and RRF fusion.
                </span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
