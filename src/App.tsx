import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header, MainNavTab } from './components/Header.tsx';
import { DeveloperCockpit } from './components/DeveloperCockpit.tsx';
import { LiveDatabaseExplorer } from './components/LiveDatabaseExplorer.tsx';
import { SchemaViewer } from './components/SchemaViewer.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { CheckCircle2, X } from 'lucide-react';
import { downloadArchitectureReport, ArchitectureSubTab } from './lib/architecture-reports.ts';
import { isSaveReportShortcut } from './lib/keyboard-shortcuts.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainNavTab>('search');
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);
  const downloadTimeoutRef = useRef<number | null>(null);

  const reportSubTab: ArchitectureSubTab = activeTab === 'schema' ? 'schema' : 'blueprint';

  const handleDownloadReport = useCallback(() => {
    const report = downloadArchitectureReport(reportSubTab);
    setDownloadedFilename(report.targetFilename);
    if (downloadTimeoutRef.current !== null) {
      window.clearTimeout(downloadTimeoutRef.current);
    }
    downloadTimeoutRef.current = window.setTimeout(() => {
      setDownloadedFilename(null);
    }, 3000);
  }, [reportSubTab]);

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
          {/* Global 3-Tab Header */}
          <Header activeTab={activeTab} setActiveTab={setActiveTab} />

          {/* Main Content Area */}
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {activeTab === 'search' && <DeveloperCockpit />}
            {activeTab === 'database' && <LiveDatabaseExplorer />}
            {activeTab === 'schema' && (
              <SchemaViewer onDownloadReport={handleDownloadReport} />
            )}
          </main>

          {/* Global Download Report Confirmation Toast (visible from any tab on Cmd+S / Ctrl+S) */}
          {downloadedFilename && (
            <div
              id="report-download-toast"
              role="status"
              aria-live="polite"
              className="fixed bottom-5 right-5 z-50 max-w-sm bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/50 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 text-xs"
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

          {/* Clean Footer */}
          <footer className="border-t border-slate-200 dark:border-slate-900 bg-white/80 dark:bg-slate-950/60 py-5 text-xs text-slate-600 dark:text-slate-500">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
              <span>Enterprise Knowledge Engine</span>
              <span>Cloud SQL PostgreSQL · pgvector HNSW · RRF Hybrid Retrieval</span>
            </div>
          </footer>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}
