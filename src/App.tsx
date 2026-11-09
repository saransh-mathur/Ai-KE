import React, { useState } from 'react';
import { Header } from './components/Header.tsx';
import { ArchitectureDiagram } from './components/ArchitectureDiagram.tsx';
import { SchemaViewer } from './components/SchemaViewer.tsx';
import { DeveloperCockpit } from './components/DeveloperCockpit.tsx';
import { GraphExplorer } from './components/GraphExplorer.tsx';
import { CodePlayground } from './components/CodePlayground.tsx';
import { LiveDatabaseExplorer } from './components/LiveDatabaseExplorer.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { Layers, Database, GitFork, Terminal } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'architecture' | 'schema' | 'liveDb' | 'graph' | 'code'>('simulator');
  const [archSubTab, setArchSubTab] = useState<'blueprint' | 'schema' | 'graph' | 'code'>('blueprint');

  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
        {/* Global Clean Header */}
        <Header activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Main Content Area */}
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
          {/* Main Search View */}
          {activeTab === 'simulator' && <DeveloperCockpit />}

          {/* Live Cloud SQL Explorer */}
          {activeTab === 'liveDb' && <LiveDatabaseExplorer />}

          {/* Architecture Documentation Suite (Segmented Clean View) */}
          {['architecture', 'schema', 'graph', 'code'].includes(activeTab) && (
            <div className="space-y-6">
              {/* Clean Sub-tab Navigation */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs font-medium">
                  <button
                    onClick={() => setArchSubTab('blueprint')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                      archSubTab === 'blueprint'
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>4-Layer Blueprint</span>
                  </button>
                  <button
                    onClick={() => setArchSubTab('schema')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                      archSubTab === 'schema'
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Schema &amp; DDL</span>
                  </button>
                  <button
                    onClick={() => setArchSubTab('graph')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                      archSubTab === 'graph'
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Multi-Hop Graph</span>
                  </button>
                  <button
                    onClick={() => setArchSubTab('code')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                      archSubTab === 'code'
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Production Code</span>
                  </button>
                </div>
              </div>

              {archSubTab === 'blueprint' && <ArchitectureDiagram />}
              {archSubTab === 'schema' && <SchemaViewer />}
              {archSubTab === 'graph' && <GraphExplorer />}
              {archSubTab === 'code' && <CodePlayground />}
            </div>
          )}
        </main>

        {/* Clean, Subtle Footer */}
        <footer className="border-t border-slate-900 bg-slate-950/60 py-6 text-xs text-slate-500">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <span>Enterprise Knowledge Engine &bull; Relational Metadata &amp; Hybrid Vector Retrieval</span>
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500">
              <span>Cloud SQL</span>
              <span>&bull;</span>
              <span>pgvector</span>
              <span>&bull;</span>
              <span>Firebase Auth</span>
            </div>
          </div>
        </footer>
      </div>
    </AuthProvider>
  );
}
