import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, Server, ShieldCheck, CheckCircle2, UserCheck, Clock, Layers } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

export const LiveDatabaseExplorer: React.FC = () => {
  const { user, idToken } = useAuth();
  const [activeTable, setActiveTable] = useState<'vendors' | 'assets' | 'incidents' | 'chunks' | 'savedQueries'>('vendors');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const fetchTableData = async (table: string) => {
    setLoading(true);
    try {
      let endpoint = '/api/vendors';
      if (table === 'assets') endpoint = '/api/assets';
      if (table === 'incidents') endpoint = '/api/incidents';
      if (table === 'chunks') endpoint = '/api/knowledge-chunks';
      if (table === 'savedQueries') endpoint = '/api/saved-queries';

      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefreshed(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to load table data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTableData(activeTable);
  }, [activeTable]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono uppercase tracking-wider mb-1">
              <Database className="w-4 h-4" />
              Live Cloud SQL for PostgreSQL Instance
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Enterprise Relational Master Data &amp; Audit Logs
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Connected to Cloud SQL developer edition with Drizzle ORM and asyncpg-compatible pooling.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchTableData(activeTable)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
              <span>Refresh</span>
            </button>
            {lastRefreshed && (
              <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
                Synced: {lastRefreshed}
              </span>
            )}
          </div>
        </div>

        {/* Table Selector Pills */}
        <div className="flex flex-wrap items-center gap-2 mt-6">
          <button
            onClick={() => setActiveTable('vendors')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeTable === 'vendors'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            vendors (Master Data)
          </button>
          <button
            onClick={() => setActiveTable('assets')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeTable === 'assets'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            assets (IT Inventory)
          </button>
          <button
            onClick={() => setActiveTable('incidents')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeTable === 'incidents'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            incidents (Post-Mortem Nodes)
          </button>
          <button
            onClick={() => setActiveTable('chunks')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeTable === 'chunks'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            knowledge_chunks (Corpus)
          </button>
          <button
            onClick={() => setActiveTable('savedQueries')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeTable === 'savedQueries'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            saved_queries (Audit Trail)
          </button>
        </div>
      </div>

      {/* Table Data View */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-indigo-400 font-semibold">{activeTable}</span>
            <span className="text-slate-500 font-mono">({data.length} records)</span>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Cloud SQL Live Connection
          </span>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
            <span>Executing query on Cloud SQL...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No records found in table <code className="text-slate-400 font-mono">{activeTable}</code>.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider sticky top-0 border-b border-slate-800">
                <tr>
                  {Object.keys(data[0]).map((col) => (
                    <th key={col} className="px-4 py-3">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                    {Object.entries(row).map(([key, val]: [string, any], vIdx) => {
                      let displayVal = val;
                      if (typeof val === 'object' && val !== null) {
                        displayVal = JSON.stringify(val);
                      } else if (val === null || val === undefined) {
                        displayVal = <span className="text-slate-600">NULL</span>;
                      }

                      return (
                        <td key={vIdx} className="px-4 py-3 max-w-xs truncate" title={String(val)}>
                          {key === 'tier' ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              Tier {val}
                            </span>
                          ) : key === 'severity' ? (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              {val}
                            </span>
                          ) : key === 'contractStatus' || key === 'contract_status' ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {val}
                            </span>
                          ) : (
                            String(displayVal)
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
