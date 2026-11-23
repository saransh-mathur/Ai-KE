import React, { useMemo, useRef, useState } from 'react';
import { CodeSectionAnchor, CodeTokenKind, tokenizeCodeLine } from '../lib/ui-formatters.ts';

interface SyntaxCodeBlockProps {
  code: string;
  language: 'sql' | 'python';
  filename: string;
  subtitle?: string;
  anchors?: CodeSectionAnchor[];
}

const DARK_TOKEN_CLASSES: Record<CodeTokenKind, string> = {
  keyword: 'text-indigo-400 font-semibold',
  type: 'text-sky-400',
  string: 'text-emerald-400',
  number: 'text-amber-300',
  comment: 'text-slate-500 italic',
  operator: 'text-rose-400',
  plain: 'text-slate-200',
};

export const SyntaxCodeBlock: React.FC<SyntaxCodeBlockProps> = ({
  code,
  language,
  filename,
  subtitle,
  anchors = [],
}) => {
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const tokenizedLines = useMemo(() => {
    return code.split(/\r?\n/).map((line) => tokenizeCodeLine(line, language));
  }, [code, language]);

  const handleJumpToLine = (lineNumber: number) => {
    const el = lineRefs.current[lineNumber];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedLine(lineNumber);
      window.setTimeout(() => {
        setHighlightedLine((curr) => (curr === lineNumber ? null : curr));
      }, 1800);
    }
  };

  return (
    <div
      data-testid="syntax-code-block"
      className="bg-slate-900 dark:bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xs"
    >
      {/* File Header + Section Jump Anchors */}
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/90 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <span className="font-mono font-semibold text-indigo-400">{filename}</span>
          {subtitle && (
            <>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-slate-400">{subtitle}</span>
            </>
          )}
        </div>

        {anchors.length > 0 && (
          <nav
            aria-label="Code section jump links"
            className="flex flex-wrap items-center gap-1.5"
          >
            {anchors.map((anchor) => (
              <button
                key={anchor.id}
                type="button"
                onClick={() => handleJumpToLine(anchor.line)}
                className="px-2 py-1 rounded-md text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 transition-colors whitespace-nowrap shrink-0"
              >
                {anchor.label}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Line-Numbered Syntax Highlighted Code Body */}
      <div className="overflow-x-auto max-h-[580px] py-3 font-mono text-xs leading-6">
        {tokenizedLines.map((tokens, index) => {
          const lineNumber = index + 1;
          const isHighlighted = highlightedLine === lineNumber;
          return (
            <div
              key={lineNumber}
              ref={(node) => {
                lineRefs.current[lineNumber] = node;
              }}
              className={`flex px-4 transition-colors duration-300 ${
                isHighlighted
                  ? 'bg-indigo-500/20'
                  : 'hover:bg-slate-800/40'
              }`}
            >
              <span
                aria-hidden="true"
                className="w-10 pr-4 text-right select-none text-slate-600 tabular-nums shrink-0"
              >
                {lineNumber}
              </span>
              <span className="whitespace-pre flex-1">
                {tokens.length === 0 ? (
                  '\u00A0'
                ) : (
                  tokens.map((tok, tIdx) => (
                    <span key={tIdx} className={DARK_TOKEN_CLASSES[tok.kind]}>
                      {tok.text}
                    </span>
                  ))
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
