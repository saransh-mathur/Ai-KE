import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header, MainNavTab } from './components/Header.tsx';
import { ArchitectureDiagram } from './components/ArchitectureDiagram.tsx';
import { SchemaViewer } from './components/SchemaViewer.tsx';
import { DeveloperCockpit } from './components/DeveloperCockpit.tsx';
import { GraphExplorer } from './components/GraphExplorer.tsx';
import { CodePlayground } from './components/CodePlayground.tsx';
import { LiveDatabaseExplorer } from './components/LiveDatabaseExplorer.tsx';
import { WebhookIngestionHub } from './components/WebhookIngestionHub.tsx';
import { MultiModalVisionStudio } from './components/MultiModalVisionStudio.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { Layers, Database, GitFork, Terminal, Download, Check, CheckCircle2, X } from 'lucide-react';
import { downloadArchitectureReport, ArchitectureSubTab } from './lib/architecture-reports.ts';
import { isSaveReportShortcut } from './lib/keyboard-shortcuts.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainNavTab>('simulator');
  const [archSubTab, setArchSubTab] = useState<ArchitectureSubTab>('blueprint');
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);
  const downloadTimeoutRef = useRef<number | null>(null);

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

  const handleDownloadReport = useCallback(() => {
    const report = downloadArchitectureReport(currentSubTab);
    setDownloadSuccess(true);
    setDownloadedFilename(report.targetFilename);
    if (downloadTimeoutRef.current !== null) {
      window.clearTimeout(downloadTimeoutRef.current);
    }
    downloadTimeoutRef.current = window.setTimeout(() => {
      setDownloadSuccess(false);
      setDownloadedFilename(null);
    }, 3000);
  }, [currentSubTab]);

  // Global Cmd+S / Ctrl+S keyboard shortcut to trigger Architecture Report download from any tab
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSaveReportShortcut(event)) {
        event.preventDefault();
        handleDownloadReport();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleDownloadReport]);

  useEffect(() => {
    return () => {
      if (downloadTimeoutRef.current !== null) {
        window.clearTimeout(downloadTimeoutRef.current);
      }
    };
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500/20 dark:selection:bg-indigo-500/30 selection:text-indigo-900 dark:selection:text-indigo-200 transition-colors duration-200">
          {/* Global Clean Header */}
          <Header activeTab={activeTab} setActiveTab={setActiveTab} />

          {/* Main Content Area */}
          <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
            {/* Main Search View */}
            {activeTab === 'simulator' && <DeveloperCockpit onNavigateToWebhooks={() => setActiveTab('webhooks')} />}

            {/* Real-Time Webhook Pipeline Hub */}
            {activeTab === 'webhooks' && <WebhookIngestionHub />}

            {/* Multi-Modal Architecture Vision Studio */}
            {activeTab === 'multimodal' && <MultiModalVisionStudio />}

            {/* Live Cloud SQL Explorer */}
            {activeTab === 'liveDb' && <LiveDatabaseExplorer />}

            {/* Architecture Documentation Suite (Segmented Clean View) */}
            {['architecture', 'schema', 'graph', 'code'].includes(activeTab) && (
              <div className="space-y-6">
                {/* Clean Sub-tab Navigation & Download Report Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex bg-white dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium overflow-x-auto shadow-xs dark:shadow-none">
                    <button
                      onClick={() => handleSelectSubTab('blueprint')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all shrink-0 ${
                        currentSubTab === 'blueprint'
                          ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-transparent'
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
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-transparent'
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
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-transparent'
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
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-transparent'
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
                        ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                        : 'bg-white dark:bg-slate-900/90 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title={`Download JSON snapshot report of currently active ${currentSubTab} tab (Cmd+S / Ctrl+S)`}
                    aria-label="Download Report"
                  >
                    {downloadSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">Report Downloaded!</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Download Report</span>
                        <span className="text-[10px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/90 px-1.5 py-0.5 rounded font-mono uppercase">
                          {currentSubTab}.json
                        </span>
                        <kbd className="hidden md:inline-block text-[10px] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 font-mono">
                          Ctrl+S
                        </kbd>
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

          {/* Global Download Report Confirmation Toast (visible from any tab on Cmd+S / Ctrl+S) */}
          {downloadedFilename && (
            <div
              id="report-download-toast"
              role="status"
              aria-live="polite"
              className="fixed bottom-5 right-5 z-50 max-w-sm bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/50 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Architecture Report Downloaded
                </div>
                <div className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate">
                  {downloadedFilename}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDownloadedFilename(null)}
                aria-label="Dismiss download notification"
                className="p-1 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Clean, Subtle Footer */}
          <footer className="border-t border-slate-200 dark:border-slate-900 bg-white/80 dark:bg-slate-950/60 py-6 text-xs text-slate-600 dark:text-slate-500">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <span>Enterprise Knowledge Engine &bull; Relational Metadata &amp; Hybrid Vector Retrieval</span>
              <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 dark:text-slate-500">
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
    </ThemeProvider>
  );
}
