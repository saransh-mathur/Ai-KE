import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header, MainNavTab } from './components/Header.tsx';
import { DeveloperCockpit } from './components/DeveloperCockpit.tsx';
import { LiveDatabaseExplorer } from './components/LiveDatabaseExplorer.tsx';
import { SqlQueryConsole } from './components/SqlQueryConsole.tsx';
import { SchemaViewer } from './components/SchemaViewer.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { CheckCircle2, Keyboard, X } from 'lucide-react';
import { downloadArchitectureReport, ArchitectureSubTab } from './lib/architecture-reports.ts';
import { isSaveReportShortcut, isShortcutsHelpKey } from './lib/keyboard-shortcuts.ts';

const KEYBOARD_SHORTCUTS = [
  { keys: ['⌘ / Ctrl', 'S'], description: 'Download Architecture & Schema JSON report from any tab' },
  { keys: ['Ctrl / ⌘', 'Enter'], description: 'Execute the active SQL statement in SQL Query Workbench' },
  { keys: ['?'], description: 'Open or close this keyboard shortcuts legend' },
  { keys: ['Esc'], description: 'Dismiss open dialogs or detail inspectors' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<MainNavTab>('search');
  const [downloadedFilename, setDownloadedFilename] = useState<string | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
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

  // Global keyboard shortcuts: Cmd/Ctrl+S (report export), ? (shortcuts legend), Esc (close modal)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSaveReportShortcut(event)) {
        event.preventDefault();
        handleDownloadReport();
        return;
      }

      if (event.key === 'Escape' && showShortcutsModal) {
        setShowShortcutsModal(false);
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (!isTyping && isShortcutsHelpKey(event)) {
        event.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleDownloadReport, showShortcutsModal]);

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
          {/* Global Top Header */}
          <Header
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onOpenShortcuts={() => setShowShortcutsModal(true)}
          />

          {/* Main Content Area */}
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {activeTab === 'search' && <DeveloperCockpit />}
            {activeTab === 'database' && <LiveDatabaseExplorer />}
            {activeTab === 'sql' && <SqlQueryConsole />}
            {activeTab === 'schema' && (
              <SchemaViewer onDownloadReport={handleDownloadReport} />
            )}
          </main>

          {/* Keyboard Shortcuts Legend Modal */}
          {showShortcutsModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm"
              onClick={() => setShowShortcutsModal(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="shortcuts-modal-title"
                data-testid="shortcuts-modal"
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Keyboard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h2 id="shortcuts-modal-title" className="text-sm font-bold text-slate-900 dark:text-white">
                      Keyboard Shortcuts
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowShortcutsModal(false)}
                    aria-label="Close keyboard shortcuts"
                    className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {KEYBOARD_SHORTCUTS.map((item) => (
                    <li
                      key={item.description}
                      className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-4"
                    >
                      <span className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {item.description}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {item.keys.map((k, idx) => (
                          <React.Fragment key={k}>
                            {idx > 0 && <span className="text-slate-400">+</span>}
                            <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {k}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

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
              <div className="flex items-center gap-3">
                <span>Cloud SQL PostgreSQL · pgvector HNSW · RRF Hybrid Retrieval</span>
                <button
                  type="button"
                  onClick={() => setShowShortcutsModal(true)}
                  className="hidden sm:inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap"
                >
                  <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-[10px]">
                    ?
                  </kbd>
                  <span>Shortcuts</span>
                </button>
              </div>
            </div>
          </footer>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}

