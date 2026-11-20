import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  TerminalSquare,
  Download,
  Copy,
  Check,
  AlertCircle,
  History,
  BarChart3,
  Table2,
  ArrowUpDown,
  RotateCcw,
  Trash2,
  Search,
  MessageSquareText,
  X,
  Pencil,
} from 'lucide-react';
import {
  SQL_QUERY_PRESETS,
  SQL_HISTORY_MAX_ITEMS,
  SQL_HISTORY_STORAGE_KEY,
  SqlHistoryItem,
  SqlResultExplanation,
  SqlComplexityProfile,
  detectChartableMetrics,
  filterSqlHistory,
  formatRowsAsCsv,
  loadSqlHistory,
  removeSqlHistoryItem,
  saveSqlHistory,
  upsertSqlHistory,
  validateReadOnlySqlQuery,
} from '../lib/sql-runner.ts';

interface SqlExplainApiResponse {
  model: string;
  sampledRowsCount: number;
  totalRows: number;
  complexity: SqlComplexityProfile;
  explanation: SqlResultExplanation;
}

interface SqlExecutionResponse {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  totalRows: number;
  truncated: boolean;
  executionTimeMs: number;
  command: string;
}

const QUICK_TABLES = [
  'vendors',
  'assets',
  'business_units',
  'incidents',
  'knowledge_chunks',
  'saved_queries',
];

export const SqlQueryConsole: React.FC = () => {
  const [sqlInput, setSqlInput] = useState<string>(SQL_QUERY_PRESETS[0].sql);
  const [executing, setExecuting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SqlExecutionResponse | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

  // Query History sidebar state (tracks last 10 successful queries across reloads/tabs)
  const [showHistorySidebar, setShowHistorySidebar] = useState<boolean>(true);
  const [historyFilter, setHistoryFilter] = useState<string>('');
  const [history, setHistory] = useState<SqlHistoryItem[]>(() => {
    if (typeof window === 'undefined') return [];
    return loadSqlHistory(window.localStorage);
  });

  const [executedSql, setExecutedSql] = useState<string>(SQL_QUERY_PRESETS[0].sql);
  const [explaining, setExplaining] = useState<boolean>(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explanationResult, setExplanationResult] = useState<SqlExplainApiResponse | null>(null);
  const [copiedExplanation, setCopiedExplanation] = useState<boolean>(false);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);

  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [sortConfig, setSortConfig] = useState<{
    column: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const runSql = useCallback(
    async (queryText: string, options?: { recordHistory?: boolean }) => {
      const preflight = validateReadOnlySqlQuery(queryText);
      if (!preflight.valid) {
        setError(preflight.error || 'Invalid SQL query.');
        return;
      }

      const shouldRecord = options?.recordHistory ?? true;
      setExecuting(true);
      setError(null);
      setEditorNotice(null);
      setSortConfig(null);
      setExplanationResult(null);
      setExplainError(null);

      try {
        const res = await fetch('/api/sql/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: queryText, maxRows: 200 }),
        });

        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `PostgreSQL error (HTTP ${res.status})`);
        }

        const payload: SqlExecutionResponse = {
          columns: Array.isArray(data.columns) ? data.columns : [],
          rows: Array.isArray(data.rows) ? data.rows : [],
          rowCount: Number(data.rowCount ?? 0),
          totalRows: Number(data.totalRows ?? 0),
          truncated: Boolean(data.truncated),
          executionTimeMs: Number(data.executionTimeMs ?? 0),
          command: String(data.command || 'SELECT'),
        };

        setResult(payload);
        setExecutedSql(queryText);

        // Only track successful SQL executions (up to last 10)
        if (shouldRecord) {
          setHistory((prev) => {
            const updated = upsertSqlHistory(prev, {
              sql: queryText,
              executedAt: new Date().toLocaleTimeString(),
              rowCount: payload.rowCount,
              executionTimeMs: payload.executionTimeMs,
            });
            if (typeof window !== 'undefined') {
              saveSqlHistory(window.localStorage, updated);
            }
            return updated;
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to execute SQL query';
        setError(message);
      } finally {
        setExecuting(false);
      }
    },
    []
  );

  // Automatically execute initial preset on mount without overwriting existing localStorage history order
  useEffect(() => {
    const existing = typeof window !== 'undefined' ? loadSqlHistory(window.localStorage) : [];
    runSql(SQL_QUERY_PRESETS[0].sql, { recordHistory: existing.length === 0 });
  }, [runSql]);

  // Keep localStorage history synchronized across browser tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === SQL_HISTORY_STORAGE_KEY) {
        setHistory(loadSqlHistory(window.localStorage));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const filteredHistory = useMemo(() => {
    return filterSqlHistory(history, historyFilter);
  }, [history, historyFilter]);

  const sortedRows = useMemo(() => {
    if (!result) return [];
    if (!sortConfig) return result.rows;

    const { column, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;

    return [...result.rows].sort((a, b) => {
      const va = a[column];
      const vb = b[column];
      if (va === null || valIsUndefined(va)) return 1;
      if (vb === null || valIsUndefined(vb)) return -1;

      const na = typeof va === 'number' ? va : Number(va);
      const nb = typeof vb === 'number' ? vb : Number(vb);
      if (
        typeof va !== 'object' &&
        typeof vb !== 'object' &&
        Number.isFinite(na) &&
        Number.isFinite(nb) &&
        String(va).trim() !== '' &&
        String(vb).trim() !== ''
      ) {
        return (na - nb) * factor;
      }

      return String(va).localeCompare(String(vb)) * factor;
    });
  }, [result, sortConfig]);

  const handleExplainResults = useCallback(async () => {
    if (!result || !executedSql.trim()) return;

    setExplaining(true);
    setExplainError(null);

    try {
      const res = await fetch('/api/sql/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: executedSql,
          columns: result.columns,
          rows: sortedRows,
          totalRows: result.totalRows || result.rowCount,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Gemini explanation error (HTTP ${res.status})`);
      }

      setExplanationResult({
        model: String(data.model || 'gemini-4-hydrogen'),
        sampledRowsCount: Number(data.sampledRowsCount ?? sortedRows.length),
        totalRows: Number(data.totalRows ?? result.totalRows ?? result.rowCount),
        complexity: data.complexity || { tier: 'standard', features: [] },
        explanation: data.explanation,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate AI SQL summary';
      setExplainError(message);
      setExplanationResult(null);
    } finally {
      setExplaining(false);
    }
  }, [executedSql, result, sortedRows]);

  const chartMeta = useMemo(() => {
    if (!result) return null;
    return detectChartableMetrics(result.columns, result.rows);
  }, [result]);

  useEffect(() => {
    if (viewMode === 'chart' && !chartMeta) {
      setViewMode('table');
    }
  }, [chartMeta, viewMode]);

  const handleSortColumn = (col: string) => {
    setSortConfig((prev) => {
      if (prev?.column === col) {
        return prev.direction === 'asc'
          ? { column: col, direction: 'desc' }
          : null;
      }
      return { column: col, direction: 'asc' };
    });
  };

  const handleDownloadCsv = () => {
    if (!result) return;
    const csv = formatRowsAsCsv(result.columns, sortedRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `postgres-query-results-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(sortedRows, null, 2));
    setCopiedJson(true);
    window.setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleCopyExplanation = () => {
    if (!explanationResult) return;
    const { explanation } = explanationResult;
    const formatted = [
      `Executive Summary:\n${explanation.executiveSummary}`,
      explanation.keyInsights.length > 0
        ? `Key Findings:\n${explanation.keyInsights.map((item) => `- ${item}`).join('\n')}`
        : '',
      `How the Query Works:\n${explanation.queryBreakdown}`,
      `Observations & Next Steps:\n${explanation.anomaliesOrNextSteps}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    navigator.clipboard.writeText(formatted);
    setCopiedExplanation(true);
    window.setTimeout(() => setCopiedExplanation(false), 2000);
  };

  const handleQuickTableSelect = (tableName: string) => {
    const query = `SELECT * FROM ${tableName} ORDER BY 1 LIMIT 25;`;
    setSqlInput(query);
    setViewMode('table');
    runSql(query);
  };

  const handleEditHistoryItem = (item: SqlHistoryItem, displayNumber: number) => {
    setSqlInput(item.sql);
    setError(null);
    setEditorNotice(`Loaded query #${displayNumber} into editor for editing`);
    window.requestAnimationFrame(() => {
      const el = editorRef.current;
      if (el) {
        el.focus();
        const len = item.sql.length;
        el.setSelectionRange(len, len);
      }
    });
  };

  const handleDeleteHistoryItem = (id: string) => {
    setHistory((prev) => {
      const updated = removeSqlHistoryItem(prev, id);
      if (typeof window !== 'undefined') {
        saveSqlHistory(window.localStorage, updated);
      }
      return updated;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    setHistoryFilter('');
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(SQL_HISTORY_STORAGE_KEY);
      } catch {
        // Ignore storage error
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runSql(sqlInput);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Table Selector */}
      <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 text-xs font-medium mb-1">
              <TerminalSquare className="w-4 h-4" />
              <span>PostgreSQL Interactive Console</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              SQL Query Workbench
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Write and execute read-only SQL queries directly against the connected PostgreSQL instance.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="toggle-sql-history-btn"
              type="button"
              onClick={() => setShowHistorySidebar(!showHistorySidebar)}
              aria-expanded={showHistorySidebar}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
                showHistorySidebar
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>
                Query History ({history.length}/{SQL_HISTORY_MAX_ITEMS})
              </span>
            </button>
          </div>
        </div>

        {/* Quick Inspect Table Shortcuts */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
          <span className="text-slate-600 dark:text-slate-400 font-medium mr-1">
            Tables:
          </span>
          {QUICK_TABLES.map((tbl) => (
            <button
              key={tbl}
              type="button"
              onClick={() => handleQuickTableSelect(tbl)}
              className="px-2.5 py-1 rounded-lg font-mono text-xs bg-slate-100 dark:bg-slate-950 hover:bg-indigo-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-white border border-slate-200 dark:border-slate-800 transition-colors"
            >
              {tbl}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Editor + Results (Left) and Query History Sidebar (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
          className={`${showHistorySidebar ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6 min-w-0`}
        >
          {/* SQL Editor Card */}
          <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
            {/* Preset Queries */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Sample PostgreSQL Queries
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SQL_QUERY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.description}
                    onClick={() => {
                      setSqlInput(preset.sql);
                      setViewMode('table');
                      runSql(preset.sql);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-white border border-slate-200 dark:border-slate-700/80 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Code Editor Textarea */}
            <div className="space-y-1.5">
              <label
                htmlFor="sql-query-editor"
                className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <span className="flex items-center gap-2">
                  <span>Raw SQL Statement</span>
                  {editorNotice && (
                    <span
                      data-testid="sql-editor-notice"
                      className="text-[11px] font-normal text-indigo-700 dark:text-indigo-400"
                    >
                      · {editorNotice}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  READ ONLY · statement_timeout=8s · max 200 rows
                </span>
              </label>
              <textarea
                ref={editorRef}
                id="sql-query-editor"
                value={sqlInput}
                onChange={(e) => {
                  setSqlInput(e.target.value);
                  if (editorNotice) setEditorNotice(null);
                }}
                onKeyDown={handleKeyDown}
                rows={7}
                spellCheck={false}
                placeholder="SELECT * FROM vendors ORDER BY tier;"
                className="w-full font-mono text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 leading-relaxed resize-y"
              />
            </div>

            {/* Editor Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  id="run-sql-query-btn"
                  type="button"
                  onClick={() => runSql(sqlInput)}
                  disabled={executing || !sqlInput.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 shadow-xs whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{executing ? 'Executing...' : 'Run Query'}</span>
                  <kbd className="hidden sm:inline-block text-[10px] bg-indigo-700/80 px-1.5 py-0.5 rounded font-mono">
                    Ctrl+Enter
                  </kbd>
                </button>

                <button
                  id="reset-sql-query-btn"
                  type="button"
                  onClick={() => setSqlInput(SQL_QUERY_PRESETS[0].sql)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>

              {result && !error && (
                <div
                  data-testid="sql-execution-metrics"
                  className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400"
                >
                  {result.rowCount} row{result.rowCount === 1 ? '' : 's'}
                  {result.truncated ? ` (capped of ${result.totalRows})` : ''} · {result.columns.length} cols ·{' '}
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    {result.executionTimeMs.toFixed(1)} ms
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Error Alert Banner */}
          {error && (
            <div
              id="sql-error-banner"
              role="alert"
              className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700/60 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 font-mono">
                <div className="font-semibold">Query Error</div>
                <div className="leading-relaxed">{error}</div>
              </div>
            </div>
          )}

          {/* Gemini AI Explanation Panel */}
          {(explaining || explainError || explanationResult) && (
            <section
              aria-label="AI Result Explanation"
              data-testid="sql-explanation-panel"
              className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      AI Result Summary
                    </h2>
                  </div>
                  {explanationResult && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                      <span>{explanationResult.model}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {explanationResult.sampledRowsCount} of {explanationResult.totalRows} rows analyzed
                      </span>
                      {explanationResult.complexity.features.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{explanationResult.complexity.features.join(', ')}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {explanationResult && (
                    <button
                      id="copy-sql-explanation-btn"
                      type="button"
                      onClick={handleCopyExplanation}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap transition-colors"
                    >
                      {copiedExplanation ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedExplanation ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}

                  <button
                    id="close-sql-explanation-btn"
                    type="button"
                    aria-label="Close AI explanation"
                    onClick={() => {
                      setExplanationResult(null);
                      setExplainError(null);
                    }}
                    className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {explaining && (
                <div className="space-y-3 py-1" role="status" aria-live="polite">
                  <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
                    Analyzing query structure and returned rows with Gemini...
                  </p>
                  <div className="space-y-2 animate-pulse">
                    <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
                    <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                    <div className="h-3 bg-slate-100 dark:bg-slate-800/70 rounded w-4/5 mt-3" />
                  </div>
                </div>
              )}

              {!explaining && explainError && (
                <div
                  id="sql-explain-error"
                  role="alert"
                  className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-900 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-semibold">Unable to generate AI explanation</div>
                      <div className="leading-relaxed">{explainError}</div>
                    </div>
                  </div>
                  <button
                    id="retry-sql-explain-btn"
                    type="button"
                    onClick={handleExplainResults}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium whitespace-nowrap self-start sm:self-auto transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!explaining && !explainError && explanationResult && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                      Executive Summary
                    </h3>
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                      {explanationResult.explanation.executiveSummary}
                    </p>
                  </div>

                  {explanationResult.explanation.keyInsights.length > 0 && (
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                      <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                        Key Findings from Returned Data
                      </h3>
                      <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300 list-disc pl-5 leading-relaxed">
                        {explanationResult.explanation.keyInsights.map((insight, idx) => (
                          <li key={idx}>{insight}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                        How the Query Works
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {explanationResult.explanation.queryBreakdown}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                        Observations & Next Steps
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {explanationResult.explanation.anomaliesOrNextSteps}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Tabular & Bar Visualization Card */}
          {result && (
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-400">
                    Query Results
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                    ({result.rowCount} {result.rowCount === 1 ? 'row' : 'rows'})
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    id="explain-sql-results-btn"
                    type="button"
                    onClick={handleExplainResults}
                    disabled={explaining || !executedSql.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 disabled:opacity-50 whitespace-nowrap transition-colors"
                  >
                    <MessageSquareText className="w-3.5 h-3.5" />
                    <span>{explaining ? 'Explaining...' : 'Explain Results'}</span>
                  </button>

                  {/* View Switcher: Table vs Bar Chart */}
                  <div className="flex items-center bg-white dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                    <button
                      id="sql-view-table-btn"
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                        viewMode === 'table'
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Table2 className="w-3.5 h-3.5" />
                      <span>Table</span>
                    </button>
                    <button
                      id="sql-view-chart-btn"
                      type="button"
                      disabled={!chartMeta}
                      onClick={() => setViewMode('chart')}
                      title={
                        chartMeta
                          ? `Visualize ${chartMeta.valueColumn} by ${chartMeta.labelColumn}`
                          : 'Requires at least 1 label column and 1 numeric column'
                      }
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors disabled:opacity-40 whitespace-nowrap ${
                        viewMode === 'chart'
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Chart</span>
                    </button>
                  </div>

                  <button
                    id="sql-export-csv-btn"
                    type="button"
                    onClick={handleDownloadCsv}
                    disabled={sortedRows.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>

                  <button
                    id="sql-copy-json-btn"
                    type="button"
                    onClick={handleCopyJson}
                    disabled={sortedRows.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 disabled:opacity-40 whitespace-nowrap"
                  >
                    {copiedJson ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedJson ? 'Copied' : 'JSON'}</span>
                  </button>
                </div>
              </div>

              {sortedRows.length === 0 ? (
                <div className="py-12 px-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Query executed successfully and returned 0 rows.
                </div>
              ) : viewMode === 'chart' && chartMeta ? (
                <div data-testid="sql-results-chart" className="p-6 space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span>
                      Metric: <strong className="font-mono text-slate-900 dark:text-white">{chartMeta.valueColumn}</strong> by{' '}
                      <strong className="font-mono text-slate-900 dark:text-white">{chartMeta.labelColumn}</strong>
                    </span>
                    <span className="font-mono">Top {Math.min(15, sortedRows.length)} rows</span>
                  </div>

                  {(() => {
                    const chartRows = sortedRows.slice(0, 15);
                    const maxVal = Math.max(
                      1,
                      ...chartRows.map((r) => Math.abs(Number(r[chartMeta.valueColumn]) || 0))
                    );
                    return (
                      <div className="space-y-3">
                        {chartRows.map((row, idx) => {
                          const rawLabel = String(row[chartMeta.labelColumn] ?? `Row ${idx + 1}`);
                          const val = Number(row[chartMeta.valueColumn]) || 0;
                          const pct = Math.max(2, Math.round((Math.abs(val) / maxVal) * 100));
                          return (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[70%]">
                                  {rawLabel}
                                </span>
                                <span className="font-mono tabular-nums font-semibold text-indigo-700 dark:text-indigo-400">
                                  {val.toLocaleString()}
                                </span>
                              </div>
                              <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px]">
                  <table
                    data-testid="sql-results-table"
                    className="w-full text-left text-xs text-slate-700 dark:text-slate-300"
                  >
                    <thead className="bg-slate-100 dark:bg-slate-900/90 text-[11px] font-mono text-slate-700 dark:text-slate-300 uppercase tracking-wider sticky top-0 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        {result.columns.map((col) => (
                          <th key={col} className="px-3.5 py-2.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleSortColumn(col)}
                              className="inline-flex items-center gap-1 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors font-semibold uppercase"
                            >
                              <span>{col}</span>
                              <ArrowUpDown
                                className={`w-3 h-3 ${
                                  sortConfig?.column === col
                                    ? 'text-indigo-600 dark:text-indigo-400'
                                    : 'opacity-40'
                                }`}
                              />
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono text-xs tabular-nums">
                      {sortedRows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                        >
                          {result.columns.map((col) => {
                            const val = row[col];
                            let content: React.ReactNode;
                            if (val === null || val === undefined) {
                              content = (
                                <span className="text-slate-400 dark:text-slate-600">NULL</span>
                              );
                            } else if (typeof val === 'object') {
                              content = JSON.stringify(val);
                            } else {
                              content = String(val);
                            }

                            return (
                              <td
                                key={col}
                                className="px-3.5 py-2.5 max-w-[260px] truncate"
                                title={
                                  val === null || val === undefined
                                    ? 'NULL'
                                    : typeof val === 'object'
                                      ? JSON.stringify(val)
                                      : String(val)
                                }
                              >
                                {col === 'severity' && (val === 'SEV-1' || val === 'SEV-2') ? (
                                  <span className="font-semibold text-rose-700 dark:text-rose-400">
                                    {String(val)}
                                  </span>
                                ) : col === 'tier' ? (
                                  <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                                    {String(val)}
                                  </span>
                                ) : (
                                  content
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar: Query History (Last 10 Successful Queries) */}
        {showHistorySidebar && (
          <aside
            aria-label="Query History"
            data-testid="sql-history-sidebar"
            className="lg:col-span-4 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Query History</span>
                </h2>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                  Saved locally · Last {SQL_HISTORY_MAX_ITEMS} queries · {history.length} saved
                </p>
              </div>

              {history.length > 0 && (
                <button
                  id="clear-sql-history-btn"
                  type="button"
                  onClick={handleClearHistory}
                  title="Clear saved query history"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {history.length > 0 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="sql-history-filter"
                  type="text"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  placeholder="Filter past SQL queries..."
                  aria-label="Filter past SQL queries"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
            )}

            {history.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Execute a SQL query to start tracking your last {SQL_HISTORY_MAX_ITEMS} successful searches.
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No history entries match &ldquo;{historyFilter}&rdquo;.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-0.5">
                {filteredHistory.map((item, idx) => {
                  const isLoadedInEditor = item.sql.trim() === sqlInput.trim();
                  return (
                    <div
                      key={item.id}
                      data-testid="sql-history-item"
                      className={`w-full text-left p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border transition-colors space-y-2.5 ${
                        isLoadedInEditor
                          ? 'border-indigo-400 dark:border-indigo-600/80'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        <span>
                          #{idx + 1} · {item.executedAt}
                        </span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          {item.rowCount} rows · {item.executionTimeMs.toFixed(1)} ms
                        </span>
                      </div>

                      <p
                        title={item.sql}
                        className="text-[11px] font-mono text-slate-800 dark:text-slate-200 break-words line-clamp-2 leading-relaxed overflow-hidden"
                      >
                        {item.sql.replace(/\s+/g, ' ').trim()}
                      </p>

                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/80 dark:border-slate-800/80">
                        <button
                          type="button"
                          data-testid="sql-history-delete-btn"
                          aria-label={`Remove query #${idx + 1} from history`}
                          title="Remove from history"
                          onClick={() => handleDeleteHistoryItem(item.id)}
                          className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            data-testid="sql-history-edit-btn"
                            aria-label={`Edit query #${idx + 1} in editor`}
                            onClick={() => handleEditHistoryItem(item, idx + 1)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            data-testid="sql-history-rerun-btn"
                            aria-label={`Re-run query #${idx + 1}`}
                            onClick={() => {
                              setSqlInput(item.sql);
                              setViewMode('table');
                              runSql(item.sql);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 transition-colors whitespace-nowrap"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Re-run</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};

function valIsUndefined(value: unknown): value is undefined {
  return value === undefined;
}
