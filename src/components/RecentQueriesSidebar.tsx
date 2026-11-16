import React, { useState, useMemo } from 'react';
import {
  History,
  Play,
  Trash2,
  Search,
  Database,
  GitFork,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  RecentQueryEntry,
  filterRecentQueries,
  formatRelativeQueryTime,
} from '../lib/playground-history.ts';
import { PlaygroundScriptType } from '../lib/playground-runner.ts';

interface RecentQueriesSidebarProps {
  entries: RecentQueryEntry[];
  activeScript?: string;
  onRerunQuery: (entry: RecentQueryEntry) => void;
  onLoadQuery: (entry: RecentQueryEntry) => void;
  onRemoveEntry: (id: string) => void;
  onResetDefaults: () => void;
  onClose?: () => void;
}

export const RecentQueriesSidebar: React.FC<RecentQueriesSidebarProps> = ({
  entries,
  activeScript,
  onRerunQuery,
  onLoadQuery,
  onRemoveEntry,
  onResetDefaults,
  onClose,
}) => {
  const [typeFilter, setTypeFilter] = useState<'all' | PlaygroundScriptType>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredEntries = useMemo(
    () => filterRecentQueries(entries, typeFilter, searchTerm),
    [entries, typeFilter, searchTerm]
  );

  return (
    <aside
      id="recent-queries-sidebar"
      aria-label="Recent Queries"
      className="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm dark:shadow-xl flex flex-col gap-3.5 h-full"
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <History className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white tracking-tight">
              Recent Queries
            </h3>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {entries.length} executed script{entries.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onResetDefaults}
            aria-label="Reset recent queries to defaults"
            title="Restore sample SQL & graph queries"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Recent Queries sidebar"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Input & Type Tabs */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter SQL or graph scripts..."
            aria-label="Filter recent queries"
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`py-1 rounded-lg transition-colors ${
              typeFilter === 'all'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('sql')}
            className={`py-1 rounded-lg transition-colors ${
              typeFilter === 'sql'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            SQL ({entries.filter((e) => e.scriptType === 'sql').length})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('graph')}
            className={`py-1 rounded-lg transition-colors ${
              typeFilter === 'graph'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Graph ({entries.filter((e) => e.scriptType === 'graph').length})
          </button>
        </div>
      </div>

      {/* Query History List */}
      {filteredEntries.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p className="font-medium text-slate-700 dark:text-slate-300">No matching scripts</p>
          <p className="text-[11px]">Run a SQL CTE or Graph traversal script to save it here.</p>
        </div>
      ) : (
        <div className="space-y-2.5 overflow-y-auto max-h-[640px] p-0.5">
          {filteredEntries.map((entry) => {
            const isLoaded = activeScript?.trim() === entry.script.trim();
            return (
              <div
                key={entry.id}
                className={`rounded-xl border p-3 transition-all space-y-2 ${
                  isLoaded
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-500/40'
                    : 'bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Badge + Timestamp */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                      entry.scriptType === 'graph'
                        ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30'
                        : 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30'
                    }`}
                  >
                    {entry.scriptType === 'graph' ? (
                      <GitFork className="w-2.5 h-2.5" />
                    ) : (
                      <Database className="w-2.5 h-2.5" />
                    )}
                    {entry.scriptType}
                  </span>

                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatRelativeQueryTime(entry.executedAt)}
                  </span>
                </div>

                {/* Title & Preview */}
                <button
                  type="button"
                  onClick={() => onLoadQuery(entry)}
                  aria-label={`Load ${entry.title} into editor`}
                  className="text-left w-full group space-y-1"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 line-clamp-1 transition-colors">
                    {entry.title}
                  </div>
                  <pre className="text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-lg px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                    {entry.script
                      .split('\n')
                      .find((line) => line.trim() && !line.trim().startsWith('--')) ||
                      entry.script.slice(0, 60)}
                  </pre>
                </button>

                {/* Metrics & Re-run Action */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    {entry.status === 'success' ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
                    )}
                    <span className="text-slate-600 dark:text-slate-400">
                      {entry.rowCount} row{entry.rowCount === 1 ? '' : 's'} &bull; {entry.durationMs}ms
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onRemoveEntry(entry.id)}
                      aria-label={`Remove ${entry.title} from history`}
                      title="Remove from history"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRerunQuery(entry)}
                      aria-label={`Re-run ${entry.title}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold shadow-xs transition-all"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
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
  );
};
