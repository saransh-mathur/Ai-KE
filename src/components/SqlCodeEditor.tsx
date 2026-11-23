import React, { useMemo, useRef } from 'react';
import { CodeTokenKind, tokenizeCodeLine } from '../lib/ui-formatters.ts';

interface SqlCodeEditorProps {
  id: string;
  value: string;
  onChange: (next: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  editorRef?: React.RefObject<HTMLTextAreaElement | null>;
}

const EDITOR_TOKEN_CLASSES: Record<CodeTokenKind, string> = {
  keyword: 'text-indigo-700 dark:text-indigo-400 font-semibold',
  type: 'text-sky-700 dark:text-sky-400',
  string: 'text-emerald-700 dark:text-emerald-400',
  number: 'text-amber-700 dark:text-amber-300',
  comment: 'text-slate-400 dark:text-slate-500 italic',
  operator: 'text-rose-600 dark:text-rose-400',
  plain: 'text-slate-900 dark:text-slate-100',
};

export const SqlCodeEditor: React.FC<SqlCodeEditorProps> = ({
  id,
  value,
  onChange,
  onKeyDown,
  placeholder,
  editorRef,
}) => {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = editorRef ?? internalRef;
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const lines = useMemo(() => value.split(/\r?\n/), [value]);
  const tokenizedLines = useMemo(
    () => lines.map((line) => tokenizeCodeLine(line, 'sql')),
    [lines]
  );

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = target.scrollTop;
      highlightRef.current.scrollLeft = target.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = target.scrollTop;
    }
  };

  return (
    <div
      data-testid="sql-code-editor-wrapper"
      className="relative flex rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/40 focus-within:border-indigo-500 transition-colors"
    >
      {/* Line Number Gutter */}
      <div
        ref={gutterRef}
        aria-hidden="true"
        data-testid="sql-editor-gutter"
        className="w-11 shrink-0 py-3.5 pr-3 pl-2 text-right select-none overflow-hidden border-r border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/60 font-mono text-xs sm:text-sm leading-6 text-slate-400 dark:text-slate-600 tabular-nums"
        style={{ height: '196px' }}
      >
        {lines.map((_, idx) => (
          <div key={idx}>{idx + 1}</div>
        ))}
      </div>

      {/* Synchronized Highlight Backdrop + Transparent Textarea */}
      <div className="relative flex-1 min-w-0" style={{ height: '196px' }}>
        <pre
          ref={highlightRef}
          aria-hidden="true"
          className="absolute inset-0 m-0 p-3.5 font-mono text-xs sm:text-sm leading-6 whitespace-pre overflow-hidden pointer-events-none"
        >
          {tokenizedLines.map((tokens, lineIdx) => (
            <div key={lineIdx} className="min-h-6">
              {tokens.length === 0 ? (
                '\u00A0'
              ) : (
                tokens.map((tok, tIdx) => (
                  <span key={tIdx} className={EDITOR_TOKEN_CLASSES[tok.kind]}>
                    {tok.text}
                  </span>
                ))
              )}
            </div>
          ))}
        </pre>

        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={handleScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          placeholder={placeholder}
          className="relative z-10 w-full h-full p-3.5 font-mono text-xs sm:text-sm leading-6 whitespace-pre overflow-auto bg-transparent text-transparent caret-slate-900 dark:caret-white placeholder:text-slate-400 dark:placeholder:text-slate-500 selection:bg-indigo-500/25 focus:outline-none resize-none"
        />
      </div>
    </div>
  );
};
