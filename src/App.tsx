import React, { useState } from 'react';
import { Header } from './components/Header.tsx';
import { ArchitectureDiagram } from './components/ArchitectureDiagram.tsx';
import { SchemaViewer } from './components/SchemaViewer.tsx';
import { DeveloperCockpit } from './components/DeveloperCockpit.tsx';
import { GraphExplorer } from './components/GraphExplorer.tsx';
import { CodePlayground } from './components/CodePlayground.tsx';
import { LiveDatabaseExplorer } from './components/LiveDatabaseExplorer.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { Layers, Database, GitFork, Terminal, Download, Check } from 'lucide-react';
import { downloadArchitectureReport, ArchitectureSubTab } from './lib/architecture-reports.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'architecture' | 'schema' | 'liveDb' | 'graph' | 'code'>('simulator');
  const [archSubTab, setArchSubTab] = useState<ArchitectureSubTab>('blueprint');
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  // Sync sub-tab if activeTab was selected directly from deep link
  const currentSubTab: ArchitectureSubTab =
    activeTab === 'schema' ? 'schema' :
    activeTab === 'graph' ? 'graph' :
    activeTab === 'code' ? 'code' :
    archSubTab;

  const handleSelectSubTab = (tab: ArchitectureSubTab) => {
    setArchSubTab(tab);
    if (['schema', 'graph', 'code'].includes(activeTab)) {
      setActiveTab('architecture');
    }
  };

  const handleDownloadReport = () => {
    downloadArchitectureReport(currentSubTab);
    setDownloadSuccess(true);
    setTimeout(() => {
      setDownloadSuccess(false);
    }, 2500);
  };

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
              {/* Clean Sub-tab Navigation & Download Report Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs font-medium overflow-x-auto">
                  <button
                    onClick={() => handleSelectSubTab('blueprint')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all shrink-0 ${
                      currentSubTab === 'blueprint'
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>4-Layer Blueprint</span>
                  </button>
                  <button
                    onClick={() => handleSelectSubTab('schema')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all shrink-0 ${
                      currentSubTab === 'schema'
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Schema &amp; DDL</span>
                  </button>
                  <button
                    onClick={() => handleSelectSubTab('graph')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all shrink-0 ${
                      currentSubTab === 'graph'
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Multi-Hop Graph</span>
                  </button>
                  <button
                    onClick={() => handleSelectSubTab('code')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all shrink-0 ${
                      currentSubTab === 'code'
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Production Code</span>
                  </button>
                </div>

                {/* Download Report Button */}
                <button
                  id="download-architecture-report-btn"
                  onClick={handleDownloadReport}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all shadow-sm shrink-0 self-start sm:self-auto ${
                    downloadSuccess
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white'
                  }`}
                  title={`Download JSON snapshot report of currently active ${currentSubTab} tab`}
                  aria-label="Download Report"
                >
                  {downloadSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-semibold text-emerald-300">Report Downloaded!</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Download Report</span>
                      <span className="text-[10px] text-slate-400 bg-slate-800/90 px-1.5 py-0.5 rounded font-mono uppercase">
                        {currentSubTab}.json
                      </span>
                    </>
                  )}
                </button>
              </div>

              {currentSubTab === 'blueprint' && <ArchitectureDiagram />}
              {currentSubTab === 'schema' && <SchemaViewer />}
              {currentSubTab === 'graph' && <GraphExplorer />}
              {currentSubTab === 'code' && <CodePlayground />}
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
