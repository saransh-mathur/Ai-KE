import React from 'react';
import {
  Network,
  LogIn,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';

export type MainNavTab = 'search' | 'database' | 'schema';

interface HeaderProps {
  activeTab: MainNavTab;
  setActiveTab: (tab: MainNavTab) => void;
}

const NAV_TABS: Array<{ id: MainNavTab; label: string }> = [
  { id: 'search', label: 'Knowledge Search' },
  { id: 'database', label: 'Live Database' },
  { id: 'schema', label: 'Schema & SQL' },
];

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const { user, dbUser, signInWithGoogle, signOutUser, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-slate-950/90 backdrop-blur sticky top-0 z-40 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-8">
          {/* Zone 1: Single-line Brand Mark */}
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
              <Network className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
              Enterprise Knowledge Engine
            </span>
          </button>

          {/* Zone 2: 3 Clean Single-Line Navigation Tabs */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
            {NAV_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isActive
                      ? 'border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-white font-semibold'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Theme Toggle & Account Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              id="theme-toggle-btn"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>

            {loading ? (
              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
            ) : (user || dbUser) ? (
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-1 px-2.5 rounded-lg whitespace-nowrap shrink-0">
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    referrerPolicy="no-referrer"
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
                  type="button"
                  onClick={signOutUser}
                  aria-label="Sign Out"
                  title="Sign Out"
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        <nav aria-label="Mobile navigation" className="flex md:hidden items-center gap-2 py-2 border-t border-slate-200 dark:border-slate-900 text-xs overflow-x-auto">
          {NAV_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
