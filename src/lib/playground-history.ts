import { PRODUCTION_RETRIEVAL_SQL } from './architecture-data.ts';
import {
  DEFAULT_SQL_AUDIT_SCRIPT,
  US_WEST_GRAPH_SCRIPT,
  GRAPH_TRAVERSAL_TEMPLATE,
  PlaygroundScriptType,
} from './playground-runner.ts';

export interface RecentQueryEntry {
  id: string;
  title: string;
  scriptType: PlaygroundScriptType;
  script: string;
  executedAt: string;
  durationMs: number;
  rowCount: number;
  status: 'success' | 'error';
  summary: string;
}

export const RECENT_QUERIES_STORAGE_KEY = 'eke-playground-recent-queries';
export const MAX_RECENT_QUERIES = 15;

export const INITIAL_RECENT_QUERIES: RecentQueryEntry[] = [
  {
    id: 'seed-sql-hybrid-cte',
    title: 'Production Hybrid Retrieval Query (pgvector + RRF)',
    scriptType: 'sql',
    script: PRODUCTION_RETRIEVAL_SQL,
    executedAt: '2026-11-15T21:15:00.000Z',
    durationMs: 14,
    rowCount: 8,
    status: 'success',
    summary: 'Single-pass CTE combining HNSW vector similarity, asset filters, and RRF (k=60)',
  },
  {
    id: 'seed-graph-us-east',
    title: 'Multi-Hop Graph Traversal: Tier-1 us-east-1 Incidents',
    scriptType: 'graph',
    script: GRAPH_TRAVERSAL_TEMPLATE,
    executedAt: '2026-11-15T20:42:00.000Z',
    durationMs: 6,
    rowCount: 2,
    status: 'success',
    summary: 'Traversed Vendor -> Asset -> BusinessUnit -> Incident chain in us-east-1',
  },
  {
    id: 'seed-sql-mission-critical',
    title: 'SQL Audit: Mission-Critical Assets & Cost Centers',
    scriptType: 'sql',
    script: DEFAULT_SQL_AUDIT_SCRIPT,
    executedAt: '2026-11-15T19:30:00.000Z',
    durationMs: 9,
    rowCount: 6,
    status: 'success',
    summary: 'Joined assets, vendors, business_units, and incidents on mission-critical tier',
  },
  {
    id: 'seed-graph-us-west',
    title: 'Multi-Hop Graph Traversal: us-west-2 Spine & Retail',
    scriptType: 'graph',
    script: US_WEST_GRAPH_SCRIPT,
    executedAt: '2026-11-15T18:10:00.000Z',
    durationMs: 4,
    rowCount: 2,
    status: 'success',
    summary: 'Resolved Cisco Nexus Spine & Checkout Worker topology in us-west-2',
  },
];

/**
 * Adds or promotes a script execution into the recent queries list,
 * deduplicating identical script bodies + types and capping at MAX_RECENT_QUERIES.
 */
export function upsertRecentQueryHistory(
  history: RecentQueryEntry[],
  entry: Omit<RecentQueryEntry, 'id'> & { id?: string }
): RecentQueryEntry[] {
  const normalizedScript = entry.script.trim();
  const filtered = history.filter(
    (item) => !(item.scriptType === entry.scriptType && item.script.trim() === normalizedScript)
  );

  const newEntry: RecentQueryEntry = {
    ...entry,
    id: entry.id || `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    script: entry.script,
  };

  return [newEntry, ...filtered].slice(0, MAX_RECENT_QUERIES);
}

/**
 * Filters recent queries by script type ('all' | 'sql' | 'graph') and search term.
 */
export function filterRecentQueries(
  history: RecentQueryEntry[],
  typeFilter: 'all' | PlaygroundScriptType,
  searchTerm: string
): RecentQueryEntry[] {
  const q = searchTerm.trim().toLowerCase();
  return history.filter((item) => {
    if (typeFilter !== 'all' && item.scriptType !== typeFilter) return false;
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.script.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q)
    );
  });
}

/**
 * Formats an ISO timestamp into a clean relative label (e.g., "Just now", "5m ago").
 */
export function formatRelativeQueryTime(isoDate: string, nowMs: number = Date.now()): string {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return 'Recently';
  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

/**
 * Loads recent queries safely from storage or falls back to curated seed entries.
 */
export function loadRecentQueriesFromStorage(storage?: Pick<Storage, 'getItem'>): RecentQueryEntry[] {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return INITIAL_RECENT_QUERIES;
    const raw = store.getItem(RECENT_QUERIES_STORAGE_KEY);
    if (!raw) return INITIAL_RECENT_QUERIES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_RECENT_QUERIES;
    return parsed;
  } catch {
    return INITIAL_RECENT_QUERIES;
  }
}

/**
 * Saves recent queries safely to storage.
 */
export function saveRecentQueriesToStorage(
  history: RecentQueryEntry[],
  storage?: Pick<Storage, 'setItem'>
): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(RECENT_QUERIES_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_RECENT_QUERIES)));
  } catch {
    // Ignore storage quota errors
  }
}
