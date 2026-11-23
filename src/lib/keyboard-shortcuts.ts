export interface ShortcutKeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Matches Cmd+S (macOS) or Ctrl+S (Windows/Linux) without Alt or Shift modifiers.
 */
export function isSaveReportShortcut(event: ShortcutKeyEventLike): boolean {
  if (!event || typeof event.key !== 'string') return false;
  const isSKey = event.key.toLowerCase() === 's';
  const hasPrimaryModifier = Boolean(event.metaKey || event.ctrlKey);
  const hasDisallowedModifier = Boolean(event.altKey || event.shiftKey);
  return isSKey && hasPrimaryModifier && !hasDisallowedModifier;
}

/**
 * Matches standalone '?' shortcut when no Cmd/Ctrl/Alt modifiers are held.
 */
export function isShortcutsHelpKey(event: ShortcutKeyEventLike): boolean {
  if (!event || typeof event.key !== 'string') return false;
  return event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey;
}

