import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database, RefreshCw, AlertCircle, CheckCircle2, Sprout } from 'lucide-react';

type TableKey = 'vendors' | 'assets' | 'businessUnits' | 'incidents' | 'chunks' | 'savedQueries';

const TABLE_CONFIG: Record<TableKey, { label: string; sqlName: string; endpoint: string }> = {
  vendors: { label: 'vendors', sqlName: 'vendors', endpoint: '/api/vendors' },
  assets: { label: 'assets', sqlName: 'assets', endpoint: '/api/assets' },
  businessUnits: { label: 'business_units', sqlName: 'business_units', endpoint: '/api/business-units' },
  incidents: { label: 'incidents', sqlName: 'incidents', endpoint: '/api/incidents' },
  chunks: { label: 'knowledge_chunks', sqlName: 'knowledge_chunks', endpoint: '/api/knowledge-chunks' },
  savedQueries: { label: 'saved_queries', sqlName: 'saved_queries', endpoint: '/api/saved-queries' },
};

export const LiveDatabaseExplorer: React.FC = () => {
  const [activeTable, setActiveTable] = useState<TableKey>('vendors');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [seeding, setSeeding] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const requestSeqRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTableData = useCallback(async (table: TableKey) => {
    // Cancel any in-flight request so stale responses never leave spinner spinning or overwrite newer state
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
        // Only surface timeout error if this is still the latest active request
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
    fetchTableData(activeTable);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [activeTable, fetchTableData]);

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

  const currentMeta = TABLE_CONFIG[activeTable];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-medium mb-1">
              <Database className="w-4 h-4" />
              <span>Cloud SQL PostgreSQL</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Live Relational Database Explorer
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Inspect live PostgreSQL tables managed via Drizzle ORM.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              id="refresh-db-btn"
              type="button"
              onClick={() => fetchTableData(activeTable)}
              disabled={loading || seeding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              id="seed-demo-data-btn"
              type="button"
              onClick={handleSeedDemoData}
              disabled={seeding || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap shadow-xs"
            >
              <Sprout className={`w-3.5 h-3.5 ${seeding ? 'animate-pulse' : ''}`} />
              <span>{seeding ? 'Seeding...' : 'Seed Demo Data'}</span>
            </button>

            {lastRefreshed && (
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 hidden md:inline ml-1">
                Synced {lastRefreshed}
              </span>
            )}
          </div>
        </div>

        {/* Seed Confirmation or Error Banner */}
        {seedMessage && (
          <div
            role="status"
            className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-700/50 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{seedMessage}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-700/50 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-3"
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

        {/* Table Selector Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(Object.keys(TABLE_CONFIG) as TableKey[]).map((key) => {
            const isActive = activeTable === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTable(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium font-mono transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
                }`}
              >
                {TABLE_CONFIG[key].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table Data Card */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-indigo-700 dark:text-indigo-400 font-semibold">
              {currentMeta.sqlName}
            </span>
            <span className="text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              ({data.length} {data.length === 1 ? 'record' : 'records'})
            </span>
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {loading ? 'Loading...' : 'PostgreSQL Live'}
          </span>
        </div>

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
        ) : (
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
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
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    {Object.entries(row).map(([key, val], vIdx) => {
                      let displayText: React.ReactNode = String(val);
                      if (typeof val === 'object' && val !== null) {
                        displayText = JSON.stringify(val);
                      } else if (val === null || val === undefined) {
                        displayText = <span className="text-slate-400 dark:text-slate-600">NULL</span>;
                      }

                      return (
                        <td key={vIdx} className="px-3.5 py-2.5 max-w-[220px] truncate" title={String(val)}>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
