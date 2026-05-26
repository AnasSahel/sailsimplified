"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  CodeFrame,
  formatByteSize,
} from "../../../_components/code-frame";
import { highlightBeanShell } from "./beanshell-highlight";

/** Nearest ancestor that actually scrolls vertically. */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

type LintIssue = {
  severity: "error" | "warning";
  message: string;
  location?: { line: number };
};

/**
 * Editable BeanShell editor (#352) wrapped in the shared `CodeFrame` chrome
 * (#419).
 *
 * A transparent `<textarea>` is layered over a syntax-highlighted `<pre>`
 * that paints the same tokens as the read-only `CodeViewer`. The textarea
 * owns the caret + selection while its glyphs are `color: transparent`,
 * so the user sees the highlighted layer behind.
 *
 * Body uses `white-space: pre` with a sticky-left line-number gutter and
 * horizontal scroll — matching `CodeViewer`'s layout. The `CodeFrame`
 * header (traffic-light dots + filename + BeanShell badge + Copy) and
 * footer (lint status + N lines · X B · BeanShell) complete the chrome.
 *
 * Tab inserts two spaces rather than moving focus.
 */
export function RuleCodeEditor({
  value,
  onChange,
  hasErrors = false,
  ariaLabel = "Rule source code",
  initialCaretLine,
  filename,
  lintIssues,
  lintErrorCount = 0,
  onJumpToLine,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Highlights the outer border in rose when server-side validation failed. */
  hasErrors?: boolean;
  ariaLabel?: string;
  /** 1-based line to focus + place the caret on at mount (fix-in-editor, #363). */
  initialCaretLine?: number;
  /** Shown in the CodeFrame header as the filename. */
  filename?: string;
  /** Live lint issues — rendered in the CodeFrame footer left. */
  lintIssues?: ReadonlyArray<LintIssue>;
  lintErrorCount?: number;
  /** Called when the user clicks the first-error chip in the footer. */
  onJumpToLine?: (line: number) => void;
}) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  const html = React.useMemo(
    () => highlightBeanShell(value) + "\n",
    [value],
  );

  const lines = React.useMemo(() => value.split("\n"), [value]);
  const lineCount = lines.length;
  const byteLabel = React.useMemo(() => formatByteSize(value), [value]);

  // On open via "fix in editor", drop the caret at the start of the target
  // line and scroll it into view. Runs once on mount.
  React.useEffect(() => {
    if (!initialCaretLine) return;
    const ta = taRef.current;
    if (!ta) return;
    const offset =
      value.split("\n").slice(0, initialCaretLine - 1).join("\n").length +
      (initialCaretLine > 1 ? 1 : 0);
    ta.focus();
    ta.setSelectionRange(offset, offset);

    requestAnimationFrame(() => {
      const scroller = findScrollParent(ta);
      if (!scroller) return;
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 18;
      const taTop =
        ta.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      const caretTop =
        scroller.scrollTop + taTop + (initialCaretLine - 1) * lineHeight;
      scroller.scrollTop = Math.max(0, caretTop - scroller.clientHeight / 2);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart, selectionEnd } = ta;
      const next =
        value.slice(0, selectionStart) + "  " + value.slice(selectionEnd);
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 2;
      });
    }
  }

  // Build the footer-left status node from lint results.
  const warningCount =
    lintIssues !== undefined
      ? lintIssues.length - lintErrorCount
      : undefined;

  const firstError =
    lintIssues !== undefined
      ? lintIssues.find((i) => i.severity === "error")
      : undefined;

  let statusNode: React.ReactNode = undefined;

  if (lintIssues !== undefined) {
    if (lintErrorCount === 0 && warningCount === 0) {
      statusNode = (
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
          <span aria-hidden>✓</span>
          <span>Clean</span>
        </span>
      );
    } else if (firstError) {
      const canJump = Boolean(firstError.location?.line && onJumpToLine);
      statusNode = (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {canJump ? (
            <button
              type="button"
              onClick={() =>
                firstError.location?.line
                  ? onJumpToLine?.(firstError.location.line)
                  : undefined
              }
              className="inline-flex min-w-0 items-center gap-1.5 truncate font-medium text-rose-400 transition-colors hover:text-rose-300"
              title={
                firstError.location?.line
                  ? `Jump to line ${firstError.location.line}`
                  : undefined
              }
            >
              <span aria-hidden>×</span>
              <span className="truncate">{firstError.message}</span>
              {firstError.location?.line ? (
                <span className="font-mono text-rose-400/70">
                  · line {firstError.location.line}
                </span>
              ) : null}
            </button>
          ) : (
            <span className="truncate font-medium text-rose-400">
              {lintErrorCount} error{lintErrorCount === 1 ? "" : "s"}
            </span>
          )}
          {warningCount !== undefined && warningCount > 0 ? (
            <span className="text-amber-400">
              {warningCount} warning{warningCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </span>
      );
    } else {
      statusNode = (
        <span className="text-muted-foreground">
          {lintErrorCount} error{lintErrorCount === 1 ? "" : "s"}
        </span>
      );
    }
  }

  return (
    <CodeFrame
      language="beanshell"
      filename={filename}
      statusNode={statusNode}
      showCopy
      showMeta
      lineCount={lineCount}
      byteLabel={byteLabel}
      value={value}
      className={cn(hasErrors && "border-rose-500/70")}
    >
      {/* Body: sticky-left gutter + pre/textarea overlay. Tokyo Night
          palette (#421) — matches CodeViewer's surface and gutter tone. */}
      <div className="flex-1 min-h-0 overflow-auto bg-[#0d1117] font-mono text-[11px] leading-relaxed text-[#c0caf5]">
        <div className="flex min-h-[12rem]">
          {/* Line-number gutter — sticky so it survives horizontal scroll */}
          <div
            className="sticky left-0 z-10 shrink-0 select-none bg-[#0d1117] py-3 pr-2 pl-3 text-right text-[#3b4261]"
            aria-hidden
          >
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          {/* Editor area: pre (highlighted) + textarea (transparent input) */}
          <div className="relative flex-1 py-3 pr-3" style={{ minWidth: "max-content" }}>
            <pre
              aria-hidden
              className="m-0 whitespace-pre text-[#c0caf5] pointer-events-none"
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => onChange(e.currentTarget.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              aria-label={ariaLabel}
              className="absolute inset-0 m-0 resize-none overflow-hidden whitespace-pre border-0 bg-transparent py-3 pr-3 text-transparent caret-[#c0caf5] outline-none focus:ring-0"
            />
          </div>
        </div>
      </div>
    </CodeFrame>
  );
}
