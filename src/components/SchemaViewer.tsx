import React, { useState } from 'react';
import { Database, Copy, Check, Download, Layers, GitMerge } from 'lucide-react';
import {
  PRODUCTION_SQL_DDL,
  PRODUCTION_RETRIEVAL_SQL,
  PRODUCTION_SQLALCHEMY_MODELS,
} from '../lib/architecture-data.ts';

interface SchemaViewerProps {
  onDownloadReport?: () => void;
}

export const SchemaViewer: React.FC<SchemaViewerProps> = ({ onDownloadReport }) => {
  const [subTab, setSubTab] = useState<'ddl' | 'rrf' | 'orm' | 'tables'>('ddl');
  const [copied, setCopied] = useState<string | null>(null);

  const getActiveCode = () => {
    if (subTab === 'rrf') return PRODUCTION_RETRIEVAL_SQL;
    if (subTab === 'orm') return PRODUCTION_SQLALCHEMY_MODELS;
    return PRODUCTION_SQL_DDL;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(subTab);
    window.setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Schema &amp; Hybrid RRF SQL Reference
            </h1>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Production PostgreSQL 16 + pgvector HNSW DDL and single-pass Reciprocal Rank Fusion (RRF) CTE retrieval query.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subTab !== 'tables' && (
            <button
              id="copy-schema-sql-btn"
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-colors whitespace-nowrap"
            >
              {copied === subTab ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied === subTab ? 'Copied!' : 'Copy SQL'}</span>
            </button>
          )}

          {onDownloadReport && (
            <button
              id="download-architecture-report-btn"
              type="button"
              onClick={onDownloadReport}
              title="Download Schema JSON snapshot (Cmd+S / Ctrl+S)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
              <kbd className="hidden sm:inline-block text-[10px] bg-indigo-700/80 px-1.5 py-0.5 rounded font-mono">
                Ctrl+S
              </kbd>
            </button>
          )}
        </div>
      </div>

      {/* Reference Sub-Tabs */}
      <div className="flex flex-wrap bg-white dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium gap-1 w-fit">
        <button
          type="button"
          onClick={() => setSubTab('ddl')}
          className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            subTab === 'ddl'
              ? 'bg-indigo-600 text-white font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          pgvector HNSW DDL
        </button>
        <button
          type="button"
          onClick={() => setSubTab('rrf')}
          className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            subTab === 'rrf'
              ? 'bg-indigo-600 text-white font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          RRF Hybrid SQL Query
        </button>
        <button
          type="button"
          onClick={() => setSubTab('orm')}
          className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            subTab === 'orm'
              ? 'bg-indigo-600 text-white font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          SQLAlchemy Models
        </button>
        <button
          type="button"
          onClick={() => setSubTab('tables')}
          className={`px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
            subTab === 'tables'
              ? 'bg-indigo-600 text-white font-semibold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Table Dictionary
        </button>
      </div>

      {/* Tab 1: pgvector HNSW DDL */}
      {subTab === 'ddl' && (
        <div className="space-y-4">
          <div className="bg-slate-900 dark:bg-slate-950 border border-slate-800 rounded-2xl p-5 overflow-hidden shadow-md">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs text-slate-400">
              <span className="font-mono text-indigo-400">schema_enterprise_kg.sql</span>
              <span className="font-mono text-slate-500">PostgreSQL 16 + pgvector 0.7.0</span>
            </div>
            <pre className="text-xs font-mono text-slate-100 dark:text-slate-300 overflow-x-auto p-2 leading-relaxed">
              <code>{PRODUCTION_SQL_DDL}</code>
            </pre>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 text-xs font-semibold mb-1.5">
                <Layers className="w-4 h-4" />
                <span>HNSW Vector Index</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Configured with <code className="font-mono text-indigo-700 dark:text-indigo-300">m = 16</code> and{' '}
                <code className="font-mono text-indigo-700 dark:text-indigo-300">ef_construction = 64</code> on{' '}
                <code className="font-mono">vector_cosine_ops</code> for &gt;98% recall.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sky-700 dark:text-sky-400 text-xs font-semibold mb-1.5">
                <Database className="w-4 h-4" />
                <span>JSONB GIN Indexing</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Uses <code className="font-mono text-sky-700 dark:text-sky-300">jsonb_path_ops</code> on asset specs and vendor metadata for compact containment queries.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-xs font-semibold mb-1.5">
                <GitMerge className="w-4 h-4" />
                <span>Relational Integrity</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Strict foreign keys link <code className="font-mono">vendors → assets → business_units / incidents → knowledge_chunks</code>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: RRF Hybrid SQL Query */}
      {subTab === 'rrf' && (
        <div className="space-y-4">
          <div className="bg-slate-900 dark:bg-slate-950 border border-slate-800 rounded-2xl p-5 overflow-hidden shadow-md">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs text-slate-400">
              <span className="font-mono text-emerald-400">sql/hybrid_retrieval_rrf.sql</span>
              <span className="font-mono text-slate-500">Single-Pass CTE · HNSW &lt;=&gt; + RRF (k=60)</span>
            </div>
            <pre className="text-xs font-mono text-slate-100 dark:text-slate-300 overflow-x-auto p-2 leading-relaxed">
              <code>{PRODUCTION_RETRIEVAL_SQL}</code>
            </pre>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
              <div className="font-semibold text-slate-900 dark:text-white mb-1">
                1. Relational Pre-Filtering
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                <code className="font-mono">filtered_entities</code> constrains active vendor tiers and AWS/GCP regions before scoring vectors.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
              <div className="font-semibold text-slate-900 dark:text-white mb-1">
                2. Graph Traversal CTE
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                <code className="font-mono">graph_traversal</code> aggregates incident counts and SEV-1 severity across joined tables in the same transaction.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
              <div className="font-semibold text-slate-900 dark:text-white mb-1">
                3. Reciprocal Rank Fusion
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Combines ordinal vector and graph ranks via <code className="font-mono">1/(k + vec_rank) + 1/(k + graph_rank)</code> with <code className="font-mono">k = 60</code>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: SQLAlchemy Models */}
      {subTab === 'orm' && (
        <div className="bg-slate-900 dark:bg-slate-950 border border-slate-800 rounded-2xl p-5 overflow-hidden shadow-md">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs text-slate-400">
            <span className="font-mono text-emerald-400">models/enterprise_models.py</span>
            <span className="font-mono text-slate-500">SQLAlchemy 2.0 Async / pgvector</span>
          </div>
          <pre className="text-xs font-mono text-slate-100 dark:text-slate-300 overflow-x-auto p-2 leading-relaxed">
            <code>{PRODUCTION_SQLALCHEMY_MODELS}</code>
          </pre>
        </div>
      )}

      {/* Tab 4: Table Dictionary */}
      {subTab === 'tables' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
            <h3 className="font-mono text-sm font-bold text-slate-900 dark:text-white mb-3">vendors</h3>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                <span>id</span>
                <span className="text-slate-500">UUID (PK)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                <span>tier</span>
                <span className="text-indigo-700 dark:text-indigo-400">ENUM (&apos;1&apos;, &apos;2&apos;, &apos;3&apos;)</span>
              </div>
              <div className="flex justify-between py-1">
                <span>metadata</span>
                <span className="text-sky-700 dark:text-sky-400">JSONB (GIN jsonb_path_ops)</span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
            <h3 className="font-mono text-sm font-bold text-slate-900 dark:text-white mb-3">assets</h3>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                <span>vendor_id</span>
                <span className="text-indigo-700 dark:text-indigo-400">UUID (FK → vendors.id)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                <span>business_unit_id</span>
                <span className="text-indigo-700 dark:text-indigo-400">UUID (FK → business_units.id)</span>
              </div>
              <div className="flex justify-between py-1">
                <span>specs</span>
                <span className="text-sky-700 dark:text-sky-400">JSONB (cores, ram, os)</span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 md:col-span-2">
            <h3 className="font-mono text-sm font-bold text-slate-900 dark:text-white mb-3">knowledge_chunks</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                  <span>asset_id</span>
                  <span className="text-indigo-700 dark:text-indigo-400">UUID (FK → assets.id)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>chunk_text</span>
                  <span className="text-slate-500">TEXT NOT NULL</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-800">
                  <span>embedding</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">vector(768)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>index</span>
                  <span className="text-indigo-700 dark:text-indigo-400">HNSW (vector_cosine_ops)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
