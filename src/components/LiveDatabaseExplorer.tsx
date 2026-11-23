import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sprout,
  Search,
  Braces,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { filterTableRecords } from '../lib/ui-formatters.ts';

type TableKey = 'vendors' | 'assets' | 'businessUnits' | 'incidents' | 'chunks' | 'savedQueries';

const TABLE_CONFIG: Record<TableKey, { label: string; sqlName: string; endpoint: string }> = {
  vendors: { label: 'vendors', sqlName: 'vendors', endpoint: '/api/vendors' },
  assets: { label: 'assets', sqlName: 'assets', endpoint: '/api/assets' },
  businessUnits: { label: 'business_units', sqlName: 'business_units', endpoint: '/api/business-units' },
  incidents: { label: 'incidents', sqlName: 'incidents', endpoint: '/api/incidents' },
  chunks: { label: 'knowledge_chunks', sqlName: 'knowledge_chunks', endpoint: '/api/knowledge-chunks' },
  savedQueries: { label: 'saved_queries', sqlName: 'saved_queries', endpoint: '/api/saved-queries' },
};

interface SelectedJsonbField {
  table: string;
  rowLabel: string;
  column: string;
  value: unknown;
}

export const LiveDatabaseExplorer: React.FC = () => {
  const [activeTable, setActiveTable] = useState<TableKey>('vendors');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [seeding, setSeeding] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedJsonb, setSelectedJsonb] = useState<SelectedJsonbField | null>(null);
  const [copiedJsonb, setCopiedJsonb] = useState<boolean>(false);

  const requestSeqRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTableData = useCallback(async (table: TableKey) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++requestSeqRef.current;

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 12000);

    setLoading(true);
    setError(null);
    setSelectedJsonb(null);

    try {
      const endpoint = TABLE_CONFIG[table].endpoint;
      const res = await fetch(endpoint, { signal: controller.signal });

      if (!res.ok) {
        let errText = `Server returned HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.error) errText = errJson.error;
        } catch {
          // Ignore non-JSON error body
        }
        throw new Error(errText);
      }

      const json = await res.json();
      if (requestSeqRef.current === requestId) {
        setData(Array.isArray(json) ? json : []);
        setLastRefreshed(new Date().toLocaleTimeString());
        setError(null);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (requestSeqRef.current === requestId) {
          setError('Query timed out waiting for Cloud SQL. Click Refresh to retry.');
        }
      } else if (requestSeqRef.current === requestId) {
        const message = err instanceof Error ? err.message : 'Failed to load table data from Cloud SQL';
        setError(message);
        setData([]);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (requestSeqRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setSearchQuery('');
    fetchTableData(activeTable);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [activeTable, fetchTableData]);

  useEffect(() => {
    if (!selectedJsonb) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedJsonb(null);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [selectedJsonb]);

  const handleSeedDemoData = async () => {
    setSeeding(true);
    setError(null);
    setSeedMessage(null);

    try {
      const res = await fetch('/api/seed-demo-data', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `Seed failed with HTTP ${res.status}`);
      }

      const counts = json?.counts;
      const summary = counts
        ? `Seeded Cloud SQL (${counts.vendors} vendors, ${counts.assets} assets, ${counts.incidents} incidents, ${counts.knowledgeChunks} chunks)`
        : 'Seeded demo records in Cloud SQL.';
      setSeedMessage(summary);
      await fetchTableData(activeTable);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to seed demo data into Cloud SQL';
      setError(message);
    } finally {
      setSeeding(false);
    }
  };

  const handleCopyJsonb = () => {
    if (!selectedJsonb) return;
    navigator.clipboard.writeText(JSON.stringify(selectedJsonb.value, null, 2));
    setCopiedJsonb(true);
    window.setTimeout(() => setCopiedJsonb(false), 1800);
  };

  const currentMeta = TABLE_CONFIG[activeTable];
  const filteredRows = useMemo(
    () => filterTableRecords(data, searchQuery),
    [data, searchQuery]
  );

  return (
    <div className="space-y-6">
      {/* Unified Unboxed Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Live Database Explorer
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Inspect live Cloud SQL PostgreSQL tables managed via Drizzle ORM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {lastRefreshed && !loading && (
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 hidden md:inline mr-1">
              Synced {lastRefreshed}
            </span>
          )}

          <button
            id="refresh-db-btn"
            type="button"
            onClick={() => fetchTableData(activeTable)}
            disabled={loading || seeding}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            id="seed-demo-data-btn"
            type="button"
            onClick={handleSeedDemoData}
            disabled={seeding || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 shadow-xs"
          >
            <Sprout className={`w-3.5 h-3.5 ${seeding ? 'animate-pulse' : ''}`} />
            <span>{seeding ? 'Seeding...' : 'Seed Demo Data'}</span>
          </button>
        </div>
      </div>

      {/* Seed Confirmation or Error Banner */}
      {seedMessage && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-700/50 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{seedMessage}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-700/50 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchTableData(activeTable)}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 font-medium shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Clean Underlined Table Tab Bar (matches Top Navigation motif) */}
      <div
        role="tablist"
        aria-label="PostgreSQL tables"
        className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-800 overflow-x-auto"
      >
        {(Object.keys(TABLE_CONFIG) as TableKey[]).map((key) => {
          const isActive = activeTable === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTable(key)}
              className={`pb-3 pt-1 text-xs font-mono border-b-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isActive
                  ? 'border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-white font-semibold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {TABLE_CONFIG[key].label}
            </button>
          );
        })}
      </div>

      {/* Table Data Card */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-indigo-700 dark:text-indigo-400 font-semibold">
              {currentMeta.sqlName}
            </span>
            {!loading && (
              <span
                data-testid="db-record-count"
                className="text-slate-600 dark:text-slate-400 font-mono tabular-nums"
              >
                {searchQuery.trim()
                  ? `(${filteredRows.length} of ${data.length} ${data.length === 1 ? 'record' : 'records'})`
                  : `(${data.length} ${data.length === 1 ? 'record' : 'records'})`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-1 sm:flex-initial justify-end">
            {!loading && data.length > 0 && (
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="db-table-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Filter ${currentMeta.sqlName} rows...`}
                  aria-label={`Filter ${currentMeta.sqlName} rows`}
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear table filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
              {loading ? 'Loading...' : 'PostgreSQL Live'}
            </span>
          </div>
        </div>

        {/* Expandable JSONB Inspector Drawer */}
        {selectedJsonb && (
          <div
            data-testid="jsonb-inspector"
            className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/80 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Braces className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {selectedJsonb.table}.{selectedJsonb.column}
                </span>
                <span className="text-slate-500 dark:text-slate-400 truncate">
                  · {selectedJsonb.rowLabel}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyJsonb}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-medium whitespace-nowrap transition-colors"
                >
                  {copiedJsonb ? (
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedJsonb ? 'Copied' : 'Copy JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedJsonb(null)}
                  aria-label="Close JSONB inspector"
                  className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <pre className="p-3.5 rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-56 leading-relaxed">
              {JSON.stringify(selectedJsonb.value, null, 2)}
            </pre>
          </div>
        )}

        {loading ? (
          <div className="p-6 space-y-3" aria-busy="true" aria-label="Loading table rows">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="h-9 rounded-lg bg-slate-100 dark:bg-slate-900 animate-pulse"
              />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
              No records found in <code className="font-mono">{currentMeta.sqlName}</code>.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Populate Cloud SQL with the demo vendors, assets, incidents, and knowledge chunks in one click.
            </p>
            <button
              type="button"
              onClick={handleSeedDemoData}
              disabled={seeding}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Sprout className="w-3.5 h-3.5" />
              <span>{seeding ? 'Seeding...' : 'Seed Demo Data'}</span>
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-10 px-6 text-center space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <p>
              No rows in <code className="font-mono">{currentMeta.sqlName}</code> match &ldquo;{searchQuery}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              Clear filter
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[520px]">
            <table
              data-testid="live-db-table"
              className="w-full text-left text-xs text-slate-700 dark:text-slate-300"
            >
              <thead className="bg-slate-100 dark:bg-slate-900/80 text-[11px] font-mono text-slate-700 dark:text-slate-400 uppercase tracking-wider sticky top-0 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  {Object.keys(data[0]).map((col) => (
                    <th key={col} className="px-3.5 py-2.5 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono text-xs tabular-nums">
                {filteredRows.map((row, idx) => {
                  const rowLabel = String(row.name ?? row.documentTitle ?? row.document_title ?? row.title ?? row.id ?? `Row ${idx + 1}`);
                  return (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                      {Object.entries(row).map(([key, val], vIdx) => {
                        const isJsonObject = typeof val === 'object' && val !== null;
                        if (isJsonObject) {
                          const compact = JSON.stringify(val);
                          const isSelected =
                            selectedJsonb?.column === key && selectedJsonb?.rowLabel === rowLabel;
                          return (
                            <td key={vIdx} className="px-3.5 py-2 max-w-[240px]">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedJsonb(
                                    isSelected
                                      ? null
                                      : {
                                          table: currentMeta.sqlName,
                                          rowLabel,
                                          column: key,
                                          value: val,
                                        }
                                  )
                                }
                                title="Inspect JSONB payload"
                                className={`inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded-md border text-left transition-colors ${
                                  isSelected
                                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                                    : 'bg-slate-100/80 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400 dark:hover:border-indigo-600'
                                }`}
                              >
                                <Braces className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                <span className="truncate">{compact}</span>
                              </button>
                            </td>
                          );
                        }

                        const displayText =
                          val === null || val === undefined ? (
                            <span className="text-slate-400 dark:text-slate-600">NULL</span>
                          ) : (
                            String(val)
                          );

                        return (
                          <td key={vIdx} className="px-3.5 py-2.5 max-w-[220px] truncate" title={String(val ?? 'NULL')}>
                            {key === 'tier' ? (
                              <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                                Tier {String(val)}
                              </span>
                            ) : key === 'severity' ? (
                              <span className="font-semibold text-rose-700 dark:text-rose-400">
                                {String(val)}
                              </span>
                            ) : key === 'contractStatus' || key === 'contract_status' ? (
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {String(val)}
                              </span>
                            ) : (
                              displayText
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

