import React, { useState } from 'react';
import {
  Network,
  LogIn,
  LogOut,
  ShieldAlert,
  ChevronDown,
  CheckCircle2,
  X,
  Sun,
  Moon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';

export type MainNavTab = 'simulator' | 'webhooks' | 'multimodal' | 'liveDb' | 'architecture' | 'schema' | 'graph' | 'code';

interface HeaderProps {
  activeTab: MainNavTab;
  setActiveTab: (tab: MainNavTab) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const { user, dbUser, signInWithGoogle, signOutUser, loading, isSsoConfigured } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showStatusPopover, setShowStatusPopover] = useState<boolean>(false);

  return (
    <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-slate-950/80 backdrop-blur sticky top-0 z-40 transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo & Clean Project Title */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveTab('simulator')}
              className="flex items-center gap-2.5 text-left group"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <Network className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight block">
                  Enterprise Knowledge Engine
                </span>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 block -mt-0.5">
                  Semantic IT Asset &amp; Vendor Intelligence
                </span>
              </div>
            </button>
          </div>

          {/* Clean Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1 text-xs font-medium">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'simulator'
                  ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white shadow-xs font-semibold border border-indigo-200/80 dark:border-transparent'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/60'
              }`}
            >
              Search
            </button>

            <button
              onClick={() => setActiveTab('webhooks')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'webhooks'
                  ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white shadow-xs font-semibold border border-indigo-200/80 dark:border-transparent'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/60'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
              <span>Webhooks</span>
            </button>

            <button
              onClick={() => setActiveTab('multimodal')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'multimodal'
                  ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white shadow-xs font-semibold border border-indigo-200/80 dark:border-transparent'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/60'
              }`}
            >
              Vision Studio
            </button>

            <button
              onClick={() => setActiveTab('liveDb')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'liveDb'
                  ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white shadow-xs font-semibold border border-indigo-200/80 dark:border-transparent'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/60'
              }`}
            >
              Database Explorer
            </button>

            <button
              onClick={() => setActiveTab('architecture')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                ['architecture', 'schema', 'graph', 'code'].includes(activeTab)
                  ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white shadow-xs font-semibold border border-indigo-200/80 dark:border-transparent'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900/60'
              }`}
            >
              Architecture &amp; DDL
            </button>
          </nav>

          {/* Right Actions: Theme Toggle, System Status & User Profile */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Theme Toggle Button */}
            <button
              id="theme-toggle-btn"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-900/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden lg:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="hidden lg:inline">Dark</span>
                </>
              )}
            </button>

            {/* Subtle System Status Button */}
            <div className="relative">
              <button
                onClick={() => setShowStatusPopover(!showStatusPopover)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-900/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800/80 transition-colors"
                title="System Infrastructure Status"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                <span className="hidden md:inline">System Active</span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>

              {/* Status Popover */}
              {showStatusPopover && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xl z-50 text-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-semibold text-slate-900 dark:text-white">System Infrastructure</span>
                    <button
                      onClick={() => setShowStatusPopover(false)}
                      className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2 font-mono text-[11px]">
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                      <span>Cloud SQL (PostgreSQL):</span>
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Connected
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                      <span>Firebase Auth (Google SSO):</span>
                      {isSsoConfigured ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                          <ShieldAlert className="w-3 h-3" /> Demo Mode
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                      <span>Drizzle ORM + Pool:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Online
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                      <span>pgvector HNSW (768-dim):</span>
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Ready
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                      <span>Ranking Formula:</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">RRF (k=60)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Auth Profile / Sign In */}
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
            ) : (user || dbUser) ? (
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 py-1 px-2.5 rounded-xl">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-600/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] font-bold">
                    {(user?.displayName || dbUser?.displayName || user?.email || dbUser?.email || 'U')[0]}
                  </div>
                )}
                <span className="hidden sm:inline text-xs text-slate-800 dark:text-slate-200 font-medium max-w-[100px] truncate">
                  {(user?.displayName || dbUser?.displayName || user?.email || dbUser?.email || 'User').split(' ')[0]}
                </span>
                <button
                  onClick={signOutUser}
                  title="Sign Out"
                  className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-sm shadow-indigo-600/20"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="flex sm:hidden overflow-x-auto py-2 gap-2 border-t border-slate-200 dark:border-slate-900 text-xs">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-2.5 py-1 rounded-lg shrink-0 ${activeTab === 'simulator' ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400'}`}
          >
            Search
          </button>
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`px-2.5 py-1 rounded-lg shrink-0 ${activeTab === 'webhooks' ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400'}`}
          >
            Webhooks
          </button>
          <button
            onClick={() => setActiveTab('multimodal')}
            className={`px-2.5 py-1 rounded-lg shrink-0 ${activeTab === 'multimodal' ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400'}`}
          >
            Vision
          </button>
          <button
            onClick={() => setActiveTab('liveDb')}
            className={`px-2.5 py-1 rounded-lg shrink-0 ${activeTab === 'liveDb' ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400'}`}
          >
            Database
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-2.5 py-1 rounded-lg shrink-0 ${['architecture', 'schema', 'graph', 'code'].includes(activeTab) ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400'}`}
          >
            Architecture
          </button>
        </div>
      </div>
    </header>
  );
};
