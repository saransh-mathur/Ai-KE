import React, { useState } from 'react';
import { FileCode, Copy, Check, Terminal, ShieldCheck, Zap } from 'lucide-react';
import { PRODUCTION_FASTAPI_CODE, PRODUCTION_RETRIEVAL_SQL, PRODUCTION_SQLALCHEMY_MODELS } from '../lib/architecture-data.ts';

export const CodePlayground: React.FC = () => {
  const [activeFile, setActiveFile] = useState<'fastapi' | 'sql' | 'orm'>('fastapi');
  const [copied, setCopied] = useState(false);

  const codeMap = {
    fastapi: {
      filename: 'services/hybrid_retrieval_service.py',
      language: 'Python (FastAPI + asyncpg)',
      code: PRODUCTION_FASTAPI_CODE,
      description: 'Asynchronous FastAPI service orchestrating Ollama dense embedding generation, asyncpg connection pool, and grounded context assembly.',
    },
    sql: {
      filename: 'queries/hybrid_cte_retrieval.sql',
      language: 'PostgreSQL 16 + pgvector CTE',
      code: PRODUCTION_RETRIEVAL_SQL,
      description: 'Single-round-trip CTE combining relational filtering, graph topological joins, pgvector HNSW cosine distance search (<=>), and Reciprocal Rank Fusion.',
    },
    orm: {
      filename: 'models/enterprise_models.py',
      language: 'SQLAlchemy 2.0 Declarative Models',
      code: PRODUCTION_SQLALCHEMY_MODELS,
      description: 'Fully typed Python ORM models with pgvector.sqlalchemy.Vector(768), PostgreSQL UUID, and JSONB mapping.',
    },
  };

  const current = codeMap[activeFile];

  const handleCopy = () => {
    navigator.clipboard.writeText(current.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header & File Selector */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-lg font-bold text-white">Production Backend &amp; Data Pipeline Code</h2>
              <p className="text-xs text-slate-400">Enterprise asynchronous Python (FastAPI / asyncpg) &amp; pgvector SQL CTE</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setActiveFile('fastapi')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeFile === 'fastapi' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                FastAPI Service
              </button>
              <button
                onClick={() => setActiveFile('sql')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeFile === 'sql' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                Hybrid SQL CTE
              </button>
              <button
                onClick={() => setActiveFile('orm')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeFile === 'orm' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                }`}
              >
                SQLAlchemy 2.0
              </button>
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 border border-slate-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Module'}</span>
            </button>
          </div>
        </div>

        {/* Description */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-300 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{current.description}</span>
        </div>
      </div>

      {/* Code Editor Frame */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/60 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            <span className="font-mono text-slate-200 ml-2">{current.filename}</span>
          </div>
          <span className="font-mono text-indigo-400">{current.language}</span>
        </div>

        <pre className="text-xs font-mono text-slate-300 p-5 overflow-x-auto leading-relaxed max-h-[600px]">
          <code>{current.code}</code>
        </pre>
      </div>
    </div>
  );
};
