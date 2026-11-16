import React, { useState, useEffect, useCallback } from 'react';
import {
  Copy,
  Check,
  Terminal,
  Zap,
  Play,
  History,
  Database,
  GitFork,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import {
  PRODUCTION_FASTAPI_CODE,
  PRODUCTION_RETRIEVAL_SQL,
  PRODUCTION_SQLALCHEMY_MODELS,
} from '../lib/architecture-data.ts';
import {
  GRAPH_TRAVERSAL_TEMPLATE,
  DEFAULT_DATASET,
  PlaygroundDataset,
  PlaygroundExecutionResult,
  PlaygroundScriptType,
  executePlaygroundScript,
  deriveScriptTitle,
} from '../lib/playground-runner.ts';
import {
  RecentQueryEntry,
  loadRecentQueriesFromStorage,
  saveRecentQueriesToStorage,
  upsertRecentQueryHistory,
  INITIAL_RECENT_QUERIES,
} from '../lib/playground-history.ts';
import { RecentQueriesSidebar } from './RecentQueriesSidebar.tsx';

type PlaygroundTab = 'sql' | 'graph' | 'fastapi' | 'orm';

export const CodePlayground: React.FC = () => {
  const [activeFile, setActiveFile] = useState<PlaygroundTab>('sql');
  const [copied, setCopied] = useState<boolean>(false);

  // Editable SQL & Graph scripts
  const [sqlScript, setSqlScript] = useState<string>(PRODUCTION_RETRIEVAL_SQL);
  const [graphScript, setGraphScript] = useState<string>(GRAPH_TRAVERSAL_TEMPLATE);

  // Recent Queries Sidebar visibility & persisted entries
  const [showRecentSidebar, setShowRecentSidebar] = useState<boolean>(true);
  const [recentQueries, setRecentQueries] = useState<RecentQueryEntry[]>(() =>
    loadRecentQueriesFromStorage()
  );

  // Execution result & live Cloud SQL dataset
  const [dataset, setDataset] = useState<PlaygroundDataset>(DEFAULT_DATASET);
  const [executionResult, setExecutionResult] = useState<PlaygroundExecutionResult | null>(() =>
    executePlaygroundScript(PRODUCTION_RETRIEVAL_SQL, 'sql', DEFAULT_DATASET)
  );

  // Hydrate dataset from live Cloud SQL tables in the background (with deterministic fallback)
  useEffect(() => {
    let cancelled = false;
    const hydrateLiveData = async () => {
      try {
        const [vRes, aRes, iRes, cRes] = await Promise.all([
          fetch('/api/vendors'),
          fetch('/api/assets'),
          fetch('/api/incidents'),
          fetch('/api/knowledge-chunks'),
        ]);

        if (!vRes.ok || !aRes.ok || !iRes.ok || !cRes.ok || cancelled) return;
        const [vendorsRaw, assetsRaw, incidentsRaw, chunksRaw] = await Promise.all([
          vRes.json(),
          aRes.json(),
          iRes.json(),
          cRes.json(),
        ]);

        if (cancelled) return;
        const hydrated: PlaygroundDataset = {
          vendors: Array.isArray(vendorsRaw) && vendorsRaw.length > 0
            ? vendorsRaw.map((v: any) => ({
                id: v.id,
                name: v.name,
                tier: Number(v.tier) as 1 | 2 | 3,
                contract_status: v.contractStatus || v.contract_status || 'active',
                metadata: {
                  category: v.category || v.metadata?.category || 'Enterprise Infrastructure',
                  account_manager: v.accountManager || v.metadata?.account_manager || '',
                  sla_percentage: Number(v.slaPercentage ?? v.metadata?.sla_percentage ?? 99.9),
                  headquarters: v.headquarters || v.metadata?.headquarters || '',
                },
              }))
            : DEFAULT_DATASET.vendors,
          assets: Array.isArray(assetsRaw) && assetsRaw.length > 0
            ? assetsRaw.map((a: any) => ({
                id: a.id,
                name: a.name,
                type: a.type,
                region: a.region,
                vendor_id: a.vendorId || a.vendor_id,
                business_unit_id: a.businessUnitId || a.business_unit_id,
                criticality: a.criticality,
                specs: a.specs || {},
              }))
            : DEFAULT_DATASET.assets,
          businessUnits: DEFAULT_DATASET.businessUnits,
          incidents: Array.isArray(incidentsRaw) && incidentsRaw.length > 0
            ? incidentsRaw.map((inc: any) => ({
                id: inc.id,
                title: inc.title,
                severity: inc.severity,
                root_cause: inc.rootCause || inc.root_cause,
                asset_id: inc.assetId || inc.asset_id,
                resolved_at: inc.resolvedAt || inc.resolved_at || null,
                downtime_minutes: Number(inc.downtimeMinutes ?? inc.downtime_minutes ?? 0),
                security_clearance: inc.security_clearance || (inc.severity === 'SEV-1' ? 'L3_RESTRICTED' : 'L2_CONFIDENTIAL'),
              }))
            : DEFAULT_DATASET.incidents,
          knowledgeChunks: Array.isArray(chunksRaw) && chunksRaw.length > 0
            ? chunksRaw.map((chk: any) => ({
                id: chk.id,
                asset_id: chk.assetId || chk.asset_id,
                document_title: chk.documentTitle || chk.document_title,
                doc_type: chk.docType || chk.doc_type,
                chunk_index: chk.chunkIndex ?? chk.chunk_index ?? 1,
                chunk_text: chk.chunkText || chk.chunk_text,
                metadata: chk.metadata || {},
                security_clearance: chk.metadata?.security_clearance || 'L1_PUBLIC',
              }))
            : DEFAULT_DATASET.knowledgeChunks,
        };

        setDataset(hydrated);
      } catch {
        // Fallback dataset already active
      }
    };

    hydrateLiveData();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistHistory = useCallback((nextHistory: RecentQueryEntry[]) => {
    setRecentQueries(nextHistory);
    saveRecentQueriesToStorage(nextHistory);
  }, []);

  const executeAndRecord = useCallback(
    (scriptToRun: string, scriptType: PlaygroundScriptType, explicitTitle?: string) => {
      const result = executePlaygroundScript(scriptToRun, scriptType, dataset);
      setExecutionResult(result);

      const updatedHistory = upsertRecentQueryHistory(recentQueries, {
        title: explicitTitle || result.title || deriveScriptTitle(scriptToRun, scriptType),
        scriptType,
        script: scriptToRun,
        executedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        rowCount: result.rowCount,
        status: result.ok ? 'success' : 'error',
        summary: result.summary,
      });

      persistHistory(updatedHistory);

      // Fire-and-forget audit log sync to Cloud SQL saved_queries
      fetch('/api/saved-queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryText: `[CodePlayground:${scriptType.toUpperCase()}] ${result.title}`,
          filtersApplied: { source: 'code_playground', scriptType },
          topResultDoc: result.rows[0]?.document_title ? String(result.rows[0].document_title) : null,
          rrfScore: result.rows[0]?.rrf_score ? Number(result.rows[0].rrf_score) : null,
        }),
      }).catch(() => {});
    },
    [dataset, recentQueries, persistHistory]
  );

  const codeMap: Record<
    PlaygroundTab,
    { filename: string; language: string; code: string; description: string; runnable: boolean }
  > = {
    sql: {
      filename: 'queries/hybrid_cte_retrieval.sql',
      language: 'PostgreSQL 16 + pgvector CTE',
      code: sqlScript,
      description:
        'Executable single-round-trip SQL CTE combining relational filtering, graph joins, pgvector HNSW search (<=>), and RRF scoring.',
      runnable: true,
    },
    graph: {
      filename: 'queries/multi_hop_traversal.cypher',
      language: 'Enterprise Graph Traversal',
      code: graphScript,
      description:
        'Executable multi-hop traversal across Vendor -> Asset -> Business Unit -> Incident structural nodes.',
      runnable: true,
    },
    fastapi: {
      filename: 'services/hybrid_retrieval_service.py',
      language: 'Python (FastAPI + asyncpg)',
      code: PRODUCTION_FASTAPI_CODE,
      description:
        'Asynchronous FastAPI service orchestrating Ollama dense embedding generation, asyncpg connection pool, and grounded context assembly.',
      runnable: false,
    },
    orm: {
      filename: 'models/enterprise_models.py',
      language: 'SQLAlchemy 2.0 Declarative Models',
      code: PRODUCTION_SQLALCHEMY_MODELS,
      description:
        'Fully typed Python ORM models with pgvector.sqlalchemy.Vector(768), PostgreSQL UUID, and JSONB mapping.',
      runnable: false,
    },
  };

  const current = codeMap[activeFile];
  const currentRunnableType: PlaygroundScriptType = activeFile === 'graph' ? 'graph' : 'sql';

  const handleCopy = () => {
    navigator.clipboard.writeText(current.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunCurrentScript = () => {
    if (activeFile === 'graph') {
      executeAndRecord(graphScript, 'graph');
    } else if (activeFile === 'sql') {
      executeAndRecord(sqlScript, 'sql');
    }
  };

  const handleLoadRecentQuery = (entry: RecentQueryEntry) => {
    if (entry.scriptType === 'graph') {
      setGraphScript(entry.script);
      setActiveFile('graph');
    } else {
      setSqlScript(entry.script);
      setActiveFile('sql');
    }
  };

  const handleRerunRecentQuery = (entry: RecentQueryEntry) => {
    handleLoadRecentQuery(entry);
    executeAndRecord(entry.script, entry.scriptType, entry.title);
  };

  const handleRemoveHistoryEntry = (id: string) => {
    persistHistory(recentQueries.filter((item) => item.id !== id));
  };

  const handleResetHistoryDefaults = () => {
    persistHistory(INITIAL_RECENT_QUERIES);
  };

  return (
    <div className="space-y-6">
      {/* Header & File Selector */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm dark:shadow-none">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Interactive SQL, Graph &amp; Backend Playground
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Execute SQL CTE or multi-hop graph traversal scripts and re-run saved sessions from Recent Queries
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Tab switch */}
            <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveFile('sql')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeFile === 'sql'
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Hybrid SQL CTE
              </button>
              <button
                type="button"
                onClick={() => setActiveFile('graph')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeFile === 'graph'
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Graph Traversal
              </button>
              <button
                type="button"
                onClick={() => setActiveFile('fastapi')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeFile === 'fastapi'
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                FastAPI Service
              </button>
              <button
                type="button"
                onClick={() => setActiveFile('orm')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeFile === 'orm'
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                SQLAlchemy 2.0
              </button>
            </div>

            <button
              id="toggle-recent-queries-btn"
              type="button"
              onClick={() => setShowRecentSidebar(!showRecentSidebar)}
              aria-expanded={showRecentSidebar}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                showRecentSidebar
                  ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Recent Queries ({recentQueries.length})</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-colors"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Description */}
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/80 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{current.description}</span>
        </div>
      </div>

      {/* Main Split Workspace: Script Editor + Output (Left) & Recent Queries Sidebar (Right) */}
      <div
        className={`grid grid-cols-1 gap-5 items-start ${
          showRecentSidebar ? 'lg:grid-cols-[minmax(0,1fr)_300px]' : ''
        }`}
      >
        {/* Left Column: Code Editor + Execution Results */}
        <div className="space-y-5 min-w-0">
          {/* Code Editor Frame (kept dark syntax surface for crisp readability in both themes) */}
          <div className="bg-slate-900 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg dark:shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-slate-800 bg-slate-900/90 dark:bg-slate-900/60 text-xs text-slate-400">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 shrink-0" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 shrink-0" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 shrink-0" />
                <span className="font-mono text-slate-200 ml-2 truncate">{current.filename}</span>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="font-mono text-indigo-400 hidden sm:inline">{current.language}</span>
                {current.runnable && (
                  <button
                    id="run-playground-script-btn"
                    type="button"
                    onClick={handleRunCurrentScript}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Run {activeFile === 'graph' ? 'Graph Traversal' : 'SQL Query'}</span>
                  </button>
                )}
              </div>
            </div>

            {current.runnable ? (
              <textarea
                aria-label={`${current.language} script editor`}
                value={current.code}
                onChange={(e) => {
                  if (activeFile === 'graph') setGraphScript(e.target.value);
                  else setSqlScript(e.target.value);
                }}
                rows={16}
                spellCheck={false}
                className="w-full bg-slate-900 dark:bg-slate-950 text-xs font-mono text-slate-100 dark:text-slate-200 p-5 leading-relaxed focus:outline-none resize-y"
              />
            ) : (
              <pre className="text-xs font-mono text-slate-100 dark:text-slate-300 p-5 overflow-x-auto leading-relaxed max-h-[500px]">
                <code>{current.code}</code>
              </pre>
            )}
          </div>

          {/* Execution Output Panel for SQL & Graph Traversal Scripts */}
          {executionResult && (
            <div
              id="playground-execution-output"
              className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-xl"
            >
              <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  {executionResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  )}
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Execution Output
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-[10px] font-mono uppercase text-slate-700 dark:text-slate-300">
                    {executionResult.scriptType === 'graph' ? (
                      <GitFork className="w-2.5 h-2.5 text-purple-600 dark:text-purple-400" />
                    ) : (
                      <Database className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400" />
                    )}
                    {executionResult.scriptType}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                  <span>{executionResult.rowCount} rows</span>
                  <span>&bull;</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {executionResult.durationMs}ms
                  </span>
                </div>
              </div>

              {!executionResult.ok ? (
                <div role="alert" className="p-4 text-xs text-rose-700 dark:text-rose-300 bg-rose-50/70 dark:bg-rose-950/30">
                  {executionResult.error}
                </div>
              ) : executionResult.rows.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-600 dark:text-slate-400">
                  Query executed cleanly ({executionResult.durationMs}ms), 0 matching rows returned for the specified filters.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                    <thead className="bg-slate-100 dark:bg-slate-950/80 text-[11px] font-mono text-slate-700 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 sticky top-0">
                      <tr>
                        {executionResult.columns.map((col) => (
                          <th key={col} className="px-4 py-2.5 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70 font-mono text-xs">
                      {executionResult.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                          {executionResult.columns.map((col) => (
                            <td key={col} className="px-4 py-2.5 max-w-[220px] truncate" title={String(row[col] ?? '')}>
                              {row[col] === null || row[col] === undefined ? (
                                <span className="text-slate-400 dark:text-slate-600">NULL</span>
                              ) : (
                                String(row[col])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Recent Queries Sidebar */}
        {showRecentSidebar && (
          <RecentQueriesSidebar
            entries={recentQueries}
            activeScript={currentRunnableType === 'graph' ? graphScript : sqlScript}
            onRerunQuery={handleRerunRecentQuery}
            onLoadQuery={handleLoadRecentQuery}
            onRemoveEntry={handleRemoveHistoryEntry}
            onResetDefaults={handleResetHistoryDefaults}
            onClose={() => setShowRecentSidebar(false)}
          />
        )}
      </div>
    </div>
  );
};
