import React, { useState } from 'react';
import { Database, Copy, Check, FileCode, Layers, Info } from 'lucide-react';
import { PRODUCTION_SQL_DDL, PRODUCTION_SQLALCHEMY_MODELS } from '../lib/architecture-data.ts';

export const SchemaViewer: React.FC = () => {
  const [subTab, setSubTab] = useState<'ddl' | 'orm' | 'tables'>('ddl');
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Tab controls & copy button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-bold text-white">Database Schema Blueprint &amp; Data Layer</h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setSubTab('ddl')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'ddl' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              PostgreSQL 16 + pgvector DDL
            </button>
            <button
              onClick={() => setSubTab('orm')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'orm' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              SQLAlchemy 2.0 Async Models
            </button>
            <button
              onClick={() => setSubTab('tables')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                subTab === 'tables' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Table Dictionary
            </button>
          </div>

          <button
            onClick={() => handleCopy(subTab === 'ddl' ? PRODUCTION_SQL_DDL : PRODUCTION_SQLALCHEMY_MODELS, subTab)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 border border-slate-700 transition-colors"
          >
            {copied === subTab ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied === subTab ? 'Copied!' : 'Copy Code'}</span>
          </button>
        </div>
      </div>

      {/* Subtab Content */}
      {subTab === 'ddl' && (
        <div className="space-y-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs text-slate-400">
              <span className="font-mono text-indigo-400">schema_enterprise_kg.sql</span>
              <span className="font-mono text-slate-500">PostgreSQL 16.2 / pgvector 0.7.0</span>
            </div>
            <pre className="text-xs font-mono text-slate-300 overflow-x-auto p-2 leading-relaxed">
              <code>{PRODUCTION_SQL_DDL}</code>
            </pre>
          </div>

          {/* Indexing Callouts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold mb-2">
                <Layers className="w-4 h-4" />
                HNSW Vector Index Tuning
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                <code className="text-indigo-300">m = 16</code>: Balances graph density and index memory consumption.
                <br />
                <code className="text-indigo-300">ef_construction = 64</code>: Build search depth ensuring &gt;98% true nearest neighbor recall.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold mb-2">
                <Database className="w-4 h-4" />
                JSONB GIN Indexing
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Indexed with <code className="text-sky-300">jsonb_path_ops</code> for 3x smaller index footprint on asset specs (cores, RAM, firmware) and vendor metadata.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold mb-2">
                <Info className="w-4 h-4" />
                Runtime ef_search
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Using <code className="text-emerald-300">SET LOCAL hnsw.ef_search = 100</code> inside asyncpg transaction permits high recall without globally locking server memory.
              </p>
            </div>
          </div>
        </div>
      )}

      {subTab === 'orm' && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 overflow-hidden">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs text-slate-400">
            <span className="font-mono text-emerald-400">models/enterprise_models.py</span>
            <span className="font-mono text-slate-500">SQLAlchemy 2.0 Async / Mapped[]</span>
          </div>
          <pre className="text-xs font-mono text-slate-300 overflow-x-auto p-2 leading-relaxed">
            <code>{PRODUCTION_SQLALCHEMY_MODELS}</code>
          </pre>
        </div>
      )}

      {subTab === 'tables' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Table: vendors */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-mono text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                vendors
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Relational Master Data
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="font-mono text-slate-300">id</span>
                <span className="text-slate-400 font-mono">UUID (PK, DEFAULT uuid_generate_v4)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="font-mono text-slate-300">name</span>
                <span className="text-slate-400 font-mono">VARCHAR(255) NOT NULL</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="font-mono text-slate-300">tier</span>
                <span className="text-indigo-400 font-mono">ENUM ('1', '2', '3')</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="font-mono text-slate-300">contract_status</span>
                <span className="text-slate-400 font-mono">ENUM ('active', 'under_review', ...)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-mono text-slate-300">metadata</span>
                <span className="text-sky-400 font-mono">JSONB (GIN jsonb_path_ops)</span>
              </div>
            </div>
          </div>

          {/* Table: assets */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-mono text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                assets
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Inventory &amp; Topology Node
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="font-mono text-slate-300">id</span>
                <span className="text-slate-400 font-mono">UUID (PK)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="font-mono text-slate-300">name</span>
                <span className="text-slate-400 font-mono">VARCHAR(255)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="font-mono text-slate-300">type</span>
                <span className="text-indigo-400 font-mono">ENUM ('database', 'server', ...)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="font-mono text-slate-300">region</span>
                <span className="text-slate-400 font-mono">VARCHAR(64) ('us-east-1', ...)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="font-mono text-slate-300">vendor_id</span>
                <span className="text-blue-400 font-mono">UUID (FK &rarr; vendors.id)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-mono text-slate-300">specs</span>
                <span className="text-sky-400 font-mono">JSONB (cores, ram, storage)</span>
              </div>
            </div>
          </div>

          {/* Table: knowledge_chunks */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 md:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-mono text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                knowledge_chunks
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                pgvector Semantic Store
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="font-mono text-slate-300">id</span>
                  <span className="text-slate-400 font-mono">UUID (PK)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="font-mono text-slate-300">asset_id</span>
                  <span className="text-indigo-400 font-mono">UUID (FK &rarr; assets.id ON DELETE CASCADE)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="font-mono text-slate-300">document_title</span>
                  <span className="text-slate-400 font-mono">VARCHAR(512)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-mono text-slate-300">chunk_text</span>
                  <span className="text-slate-400 font-mono">TEXT NOT NULL</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="font-mono text-emerald-400 font-semibold">embedding</span>
                  <span className="text-emerald-400 font-mono font-bold">vector(768) (nomic-embed-text)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="font-mono text-slate-300">vector index</span>
                  <span className="text-indigo-400 font-mono">HNSW (m=16, ef_construction=64)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="font-mono text-slate-300">operator</span>
                  <span className="text-slate-400 font-mono">vector_cosine_ops (&lt;=&gt;)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="font-mono text-slate-300">metadata</span>
                  <span className="text-sky-400 font-mono">JSONB (author, tags, review)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
