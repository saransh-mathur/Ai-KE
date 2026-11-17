import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Lock,
  EyeOff,
  X,
  Database,
} from 'lucide-react';
import {
  parseNaturalLanguageQuery,
  executeHybridRetrievalWithRbac,
  QueryAnalysis,
} from '../lib/hybrid-search.ts';
import {
  HybridSearchResult,
  SecurityClearanceLevel,
  RedactedDocumentNotice,
} from '../lib/types.ts';
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
  const { idToken } = useAuth();

  // Left-panel query & 3 filter dropdowns
  const [queryInput, setQueryInput] = useState<string>(QUICK_PROMPTS[0].query);
  const [selectedRegion, setSelectedRegion] = useState<string>(QUICK_PROMPTS[0].region);
  const [selectedTier, setSelectedTier] = useState<string>(QUICK_PROMPTS[0].tier);
  const [securityClearance, setSecurityClearance] = useState<SecurityClearanceLevel>('L3_RESTRICTED');

  // RLHF Feedback & Dynamic RRF tuning
  const [feedbackRating, setFeedbackRating] = useState<'positive' | 'negative' | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState<boolean>(false);
  const [feedbackCategory, setFeedbackCategory] = useState<string>('Missing Graph Context');
  const [feedbackNote, setFeedbackNote] = useState<string>('');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [dynamicRrfK, setDynamicRrfK] = useState<number>(60);

  // Right-panel drawer & status state
  const [showProofDrawer, setShowProofDrawer] = useState<boolean>(false);
  const [showRedactedDetails, setShowRedactedDetails] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [savedToDb, setSavedToDb] = useState<boolean>(false);

  // AI Answer state
  const [aiAnswerText, setAiAnswerText] = useState<string | null>(null);
  const [activeModelLabel, setActiveModelLabel] = useState<string>('Grounded Synthesis Engine');

  const queryAnalysis: QueryAnalysis = useMemo(() => {
    return parseNaturalLanguageQuery(queryInput);
  }, [queryInput]);

  const hybridExecution = useMemo(() => {
    return executeHybridRetrievalWithRbac(queryInput, queryAnalysis, {
      applySqlFilters: true,
      useGraphRank: true,
      overrideRegion: selectedRegion,
      overrideTier: selectedTier,
      userClearance: securityClearance,
      kConstant: dynamicRrfK,
      maxResults: 5,
    });
  }, [queryInput, queryAnalysis, selectedRegion, selectedTier, securityClearance, dynamicRrfK]);

  const results: HybridSearchResult[] = hybridExecution.results;
  const redactedNotices: RedactedDocumentNotice[] = hybridExecution.redactedNotices;
  const topResult = results[0];

  const fallbackGroundedAnswer = useMemo(() => {
    if (results.length === 0) {
      return 'No matching enterprise IT assets or documentation met the specified filters and security clearance. Try widening the region, vendor tier, or clearance level.';
    }

    if (topResult?.asset.id === 'ast-srv-alpha') {
      return `SRV-Alpha (CloudScale V-101) is a hardened server deployed in europe-west1 under an active Tier-1 agreement.

• Hardware & Capacity: Equipped with 64 AMD EPYC cores, 256GB ECC RAM, and 32TB NVMe scratch storage.
• Business Dependency: Dedicated to Cybersecurity & Compliance (Cost Center CC-SEC-0010) for automated GDPR cross-border data isolation and mTLS zero-trust ingress.
• Reliability Status: Operates under a 99.95% SLA with zero reported severity incidents or active remediation tickets.`;
    }

    if (topResult?.incident) {
      return `The primary affected asset in ${topResult.asset.region} is "${topResult.asset.name}", provided by ${topResult.vendor.name} (Tier ${topResult.vendor.tier}).

• Incident Root Cause: ${topResult.incident.title} (${topResult.incident.severity}) — ${topResult.incident.root_cause}
• Business Unit Impact: ${topResult.businessUnit.name} (Cost Center ${topResult.businessUnit.cost_center}) relies directly on this asset.
• Recovery Context: Verified from ${topResult.chunk.document_title} across ${results.length} grounded source chunks.`;
    }

    return `Found ${results.length} verified enterprise records matching "${queryInput}".

The top-ranked asset is "${topResult.asset.name}" supplied by ${topResult.vendor.name} (Tier ${topResult.vendor.tier}, ${topResult.asset.region}), supporting the ${topResult.businessUnit.name} division. All citations are verified against relational master data and vector chunks.`;
  }, [results, topResult, queryInput]);

  const displayAnswer = aiAnswerText || fallbackGroundedAnswer;

  const handleRunSearch = async () => {
    setIsSearching(true);

    const contextPayload = results
      .slice(0, 3)
      .map(
        (r, i) => `[Source ${i + 1}: ${r.chunk.document_title}]
Vendor: ${r.vendor.name} (Tier ${r.vendor.tier}, Status: ${r.vendor.contract_status})
Asset: ${r.asset.name} (Type: ${r.asset.type}, Region: ${r.asset.region})
Business Unit: ${r.businessUnit.name} (Cost Center: ${r.businessUnit.cost_center})
${r.incident ? `Incident: ${r.incident.title} (${r.incident.severity}) - Root Cause: ${r.incident.root_cause}` : 'No active incident'}
Passage:
${r.chunk.chunk_text}`
      )
      .join('\n\n');

    try {
      const aiRes = await fetch('/api/generate-ai-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryInput,
          context: contextPayload || 'No context chunks matched current clearance and filters.',
          provider: 'auto',
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        if (aiData.answer) {
          setAiAnswerText(aiData.answer);
          setActiveModelLabel(aiData.provider);
        } else {
          setAiAnswerText(null);
          setActiveModelLabel(aiData.provider || 'Deterministic Grounding Engine');
        }
      }
    } catch {
      setAiAnswerText(null);
      setActiveModelLabel('Deterministic Grounding Engine');
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

      await fetch('/api/saved-queries', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          queryText: queryInput,
          filtersApplied: {
            region: selectedRegion,
            tier: selectedTier,
            clearance: securityClearance,
          },
          topResultDoc: topResult?.chunk.document_title || null,
          rrfScore: topResult?.rrfScore || null,
        }),
      });
      setSavedToDb(true);
      window.setTimeout(() => setSavedToDb(false), 2500);
    } catch {
      // Non-fatal audit logging
    } finally {
      setIsSearching(false);
    }
  };

  const handleThumbsUp = async () => {
    setFeedbackRating('positive');
    setFeedbackToast('Feedback logged to Cloud SQL RLHF dataset.');
    window.setTimeout(() => setFeedbackToast(null), 3000);

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryText: queryInput,
          answerSnippet: displayAnswer.slice(0, 240),
          rating: 'positive',
          selectedDocId: topResult?.chunk.id,
          rrfWeightAdjustment: { kAdjustment: 0, positiveReinforcement: true },
        }),
      });
    } catch {
      // Non-fatal
    }
  };

  const handleSubmitNegativeFeedback = async () => {
    setFeedbackRating('negative');
    setShowFeedbackModal(false);
    setDynamicRrfK(65);
    setFeedbackToast('Feedback recorded. Session RRF k adjusted to 65 for tighter precision.');
    window.setTimeout(() => setFeedbackToast(null), 3500);

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryText: queryInput,
          answerSnippet: displayAnswer.slice(0, 240),
          rating: 'negative',
          feedbackNote: `[${feedbackCategory}] ${feedbackNote}`.trim(),
          selectedDocId: topResult?.chunk.id,
          rrfWeightAdjustment: { kAdjustment: 5, category: feedbackCategory },
        }),
      });
    } catch {
      // Non-fatal
    }
  };

  const handleCopyAnswer = () => {
    navigator.clipboard.writeText(displayAnswer);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Enterprise Knowledge Search
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Hybrid retrieval combining PostgreSQL relational pre-filters, pgvector similarity, and multi-hop entity traversal.
        </p>
      </div>

      {/* Feedback Toast */}
      {feedbackToast && (
        <div
          role="status"
          className="bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-500/50 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200"
        >
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{feedbackToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            aria-label="Dismiss feedback notification"
            className="p-1 text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main 2-Column Workspace: Left Controls / Right Answer & Proof Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Query Input + 3 Clean Dropdowns */}
        <section className="lg:col-span-5 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
          <div className="space-y-2">
            <label
              htmlFor="knowledge-query-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Natural Language Query
            </label>
            <textarea
              id="knowledge-query-input"
              value={queryInput}
              onChange={(e) => {
                setQueryInput(e.target.value);
                setAiAnswerText(null);
              }}
              rows={4}
              placeholder="Ask about vendor contracts, assets, regions, or incident post-mortems..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl p-3.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 leading-relaxed resize-y"
            />
          </div>

          {/* Quick Prompt Presets */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Sample Queries
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setQueryInput(preset.query);
                    setSelectedRegion(preset.region);
                    setSelectedTier(preset.tier);
                    setAiAnswerText(null);
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-white border border-slate-200 dark:border-slate-700/70 transition-colors text-left"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3 Clean Dropdowns */}
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="space-y-1.5">
              <label
                htmlFor="filter-region-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Target Region
              </label>
              <select
                id="filter-region-select"
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="all">All Regions</option>
                <option value="us-east-1">us-east-1 (N. Virginia)</option>
                <option value="europe-west1">europe-west1 (Frankfurt / Belgium)</option>
                <option value="us-west-2">us-west-2 (Oregon)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="filter-tier-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Vendor Tier
              </label>
              <select
                id="filter-tier-select"
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="all">All Tiers</option>
                <option value="1">Tier 1 (Mission-Critical)</option>
                <option value="2">Tier 2 (Enterprise Standard)</option>
                <option value="3">Tier 3 (Commodity)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="filter-clearance-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Security Clearance (RBAC)
              </label>
              <select
                id="filter-clearance-select"
                value={securityClearance}
                onChange={(e) => setSecurityClearance(e.target.value as SecurityClearanceLevel)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="L3_RESTRICTED">L3 Restricted (Security Admin)</option>
                <option value="L2_CONFIDENTIAL">L2 Confidential (Operations SRE)</option>
                <option value="L1_PUBLIC">L1 Public (General Staff)</option>
              </select>
            </div>
          </div>

          {/* Primary Search CTA */}
          <button
            id="run-knowledge-search-btn"
            type="button"
            onClick={handleRunSearch}
            disabled={isSearching || !queryInput.trim()}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <Search className="w-4 h-4" />
            <span>{isSearching ? 'Searching...' : 'Run Knowledge Search'}</span>
          </button>
        </section>

        {/* RIGHT COLUMN: Top AI Answer Card + Expandable Drawer Below */}
        <div className="lg:col-span-7 space-y-4">
          {/* RBAC Pre-Filtering Redaction Notice (when lower clearance prunes chunks) */}
          {redactedNotices.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-600/40 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-amber-950 dark:text-amber-200">
                      RBAC Pre-Filter Redacted {redactedNotices.length} Restricted Document{redactedNotices.length > 1 ? 's' : ''}
                    </div>
                    <p className="text-amber-900/90 dark:text-amber-300/80 leading-relaxed">
                      Documents exceeding <span className="font-mono font-semibold">{securityClearance}</span> were excluded before vector ranking and LLM grounding.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRedactedDetails(!showRedactedDetails)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/70 border border-amber-300 dark:border-amber-600/30 text-amber-900 dark:text-amber-200 shrink-0 flex items-center gap-1 font-medium whitespace-nowrap"
                >
                  <EyeOff className="w-3 h-3" />
                  <span>{showRedactedDetails ? 'Hide' : 'Inspect'}</span>
                </button>
              </div>

              {showRedactedDetails && (
                <div className="pt-2 border-t border-amber-300/70 dark:border-amber-700/30 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {redactedNotices.map((notice) => (
                    <div
                      key={notice.id}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-900/50 space-y-1"
                    >
                      <div className="font-medium text-slate-900 dark:text-slate-200 truncate">
                        {notice.documentTitle}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        <span>Requires {notice.requiredClearance}</span>
                        <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Pruned
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Top Card: AI Grounded Answer */}
          <section
            aria-label="AI Grounded Answer"
            className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  AI Grounded Answer
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span>{activeModelLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">RRF k={dynamicRrfK}</span>
                  {savedToDb && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Logged to Cloud SQL</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 gap-1">
                  <button
                    type="button"
                    onClick={handleThumbsUp}
                    aria-label="Mark answer helpful"
                    className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors whitespace-nowrap ${
                      feedbackRating === 'positive'
                        ? 'bg-emerald-600 text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Helpful</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFeedbackModal(true)}
                    aria-label="Report answer issue"
                    className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors whitespace-nowrap ${
                      feedbackRating === 'negative'
                        ? 'bg-rose-600 text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400'
                    }`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Issue</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCopyAnswer}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div
              data-testid="ai-answer-body"
              className="text-sm sm:text-base text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-line"
            >
              {displayAnswer}
            </div>

            {topResult && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                <span>
                  Vendor: <strong className="text-slate-900 dark:text-white">{topResult.vendor.name}</strong> (Tier {topResult.vendor.tier})
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Asset: <strong className="text-slate-900 dark:text-white">{topResult.asset.name}</strong> ({topResult.asset.region})
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  BU: <strong className="text-slate-900 dark:text-white">{topResult.businessUnit.name}</strong>
                </span>
                {topResult.incident && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-rose-700 dark:text-rose-300 font-medium">
                      Incident: {topResult.incident.severity}
                    </span>
                  </>
                )}
              </div>
            )}
          </section>

          {/* Bottom Expandable Drawer: 4-Node Visual Chain + Matched Text Chunk */}
          <section className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <button
              id="toggle-retrieval-drawer-btn"
              type="button"
              onClick={() => setShowProofDrawer(!showProofDrawer)}
              aria-expanded={showProofDrawer}
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Retrieval Trace: 4-Node Entity Chain &amp; Matched Chunk
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                  {results.length} matched source{results.length === 1 ? '' : 's'} · RRF {topResult ? topResult.rrfScore.toFixed(5) : '0.00000'}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-400 shrink-0">
                <span>{showProofDrawer ? 'Collapse' : 'Inspect Trace'}</span>
                {showProofDrawer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showProofDrawer && (
              <div
                id="retrieval-proof-drawer-content"
                className="p-5 sm:p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-6"
              >
                {topResult ? (
                  <>
                    {/* 1. 4-Node Visual Chain: Vendor -> Asset -> BU -> Incident */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        4-Node Relationship Chain (Vendor → Asset → Business Unit → Incident)
                      </h3>

                      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                        {/* Node 1: Vendor */}
                        <div className="flex-1 min-w-0 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] font-mono text-indigo-700 dark:text-indigo-400 font-semibold whitespace-nowrap">
                            1. Vendor
                          </div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 truncate" title={topResult.vendor.name}>
                            {topResult.vendor.name}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums truncate">
                            Tier {topResult.vendor.tier} · {topResult.vendor.contract_status}
                          </div>
                        </div>

                        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 self-center rotate-90 md:rotate-0" />

                        {/* Node 2: Asset */}
                        <div className="flex-1 min-w-0 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] font-mono text-sky-700 dark:text-sky-400 font-semibold whitespace-nowrap">
                            2. Asset
                          </div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 truncate" title={topResult.asset.name}>
                            {topResult.asset.name}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                            {topResult.asset.type} · {topResult.asset.region}
                          </div>
                        </div>

                        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 self-center rotate-90 md:rotate-0" />

                        {/* Node 3: BU */}
                        <div className="flex-1 min-w-0 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] font-mono text-amber-700 dark:text-amber-400 font-semibold whitespace-nowrap">
                            3. Business Unit
                          </div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 truncate" title={topResult.businessUnit.name}>
                            {topResult.businessUnit.name}
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-mono truncate">
                            {topResult.businessUnit.cost_center}
                          </div>
                        </div>

                        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 self-center rotate-90 md:rotate-0" />

                        {/* Node 4: Incident */}
                        <div className="flex-1 min-w-0 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] font-mono text-rose-700 dark:text-rose-400 font-semibold whitespace-nowrap">
                            4. Incident
                          </div>
                          {topResult.incident ? (
                            <>
                              <div className="text-xs font-semibold text-rose-700 dark:text-rose-300 mt-0.5 truncate" title={topResult.incident.title}>
                                {topResult.incident.title}
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums truncate">
                                {topResult.incident.severity} · {topResult.incident.downtime_minutes}m
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              No active incidents
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 2. Matched Text Chunk */}
                    <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Matched Vector Chunk
                        </h3>
                        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          <span>Similarity: <strong className="text-slate-900 dark:text-white">{topResult.vectorSimilarity.toFixed(3)}</strong></span>
                          <span aria-hidden="true">·</span>
                          <span>RRF: <strong className="text-indigo-700 dark:text-indigo-400">{topResult.rrfScore.toFixed(5)}</strong></span>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {topResult.chunk.document_title}
                          </span>
                          <span className="font-mono text-slate-500 dark:text-slate-400">
                            {topResult.chunk.id} · {topResult.chunk.doc_type}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                          {topResult.chunk.chunk_text}
                        </p>
                      </div>

                      {/* Additional matched chunks summary if any */}
                      {results.length > 1 && (
                        <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                          <Database className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Also matched: {results.slice(1).map((r) => r.chunk.document_title).join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-600 dark:text-slate-400 py-4 text-center">
                    No matching nodes or vector chunks available under the current filters and clearance.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* RLHF Negative Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Log Retrieval Issue</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">Logs correction signal to Cloud SQL feedback_logs</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFeedbackModal(false)}
                aria-label="Close modal"
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="feedback-category-select" className="text-slate-700 dark:text-slate-300 font-medium block mb-1">
                  Issue Category
                </label>
                <select
                  id="feedback-category-select"
                  value={feedbackCategory}
                  onChange={(e) => setFeedbackCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value="Missing Graph Context">Missing Graph Context</option>
                  <option value="Hallucinated Entity Detail">Hallucinated Entity Detail</option>
                  <option value="Incorrect Incident Correlation">Incorrect Incident Correlation</option>
                  <option value="Stale Policy or SLA">Stale Policy or SLA</option>
                </select>
              </div>

              <div>
                <label htmlFor="feedback-note-input" className="text-slate-700 dark:text-slate-300 font-medium block mb-1">
                  Correction Note (Optional)
                </label>
                <textarea
                  id="feedback-note-input"
                  value={feedbackNote}
                  onChange={(e) => setFeedbackNote(e.target.value)}
                  rows={3}
                  placeholder="Describe expected vendor, asset, or incident link..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowFeedbackModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitNegativeFeedback}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500"
              >
                Submit &amp; Tune RRF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
