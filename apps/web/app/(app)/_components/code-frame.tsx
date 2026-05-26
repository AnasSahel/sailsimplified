"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared chrome shell for code displays (#419).
 *
 * Renders the IDE-like outer frame:
 *  - macOS-style traffic-light dots + filename label + language badge (header)
 *  - optional Copy button in the header
 *  - body slot: `children` (the caller owns scroll/overflow)
 *  - optional footer: status left, `N lines · M B · Language` right
 *
 * Used by both read-only (`CodeViewer`) and editable (`RuleCodeEditor`,
 * `RawJsonEditor`) surfaces so their chrome is visually identical.
 */

export type CodeFrameLanguage = "json" | "beanshell" | "plain";

export type CodeFrameStatus = {
  ok: boolean;
  message: string;
};

export type CodeFrameProps = {
  children: React.ReactNode;
  language: CodeFrameLanguage;
  filename?: string;
  /** Simple text status rendered in footer left. */
  status?: CodeFrameStatus;
  /**
   * Rich React node rendered in footer left — overrides `status` when
   * provided. Use for clickable error links that can't be expressed as plain
   * `{ ok, message }`.
   */
  statusNode?: React.ReactNode;
  /** Show the Copy button in the header. Default true. */
  showCopy?: boolean;
  /** Show `N lines · M B · Language` in the footer right. Default true. */
  showMeta?: boolean;
  lineCount?: number;
  byteLabel?: string;
  /** Source text — used by the Copy button. */
  value?: string;
  className?: string;
};

export const LANGUAGE_LABEL: Record<CodeFrameLanguage, string> = {
  json: "JSON",
  beanshell: "BeanShell",
  plain: "Plain text",
};

export const LANGUAGE_BADGE_CLASS: Record<CodeFrameLanguage, string> = {
  json: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  beanshell: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  plain: "bg-neutral-700/40 text-neutral-300 border-neutral-600/50",
};

export function formatByteSize(value: string): string {
  const bytes = new TextEncoder().encode(value).length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useCopyToClipboard(value: string) {
  const [copied, setCopied] = React.useState(false);

  function copy() {
    function markCopied() {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }

    function legacyFallback(): boolean {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard) {
      if (legacyFallback()) markCopied();
      return;
    }
    navigator.clipboard.writeText(value).then(markCopied, () => {
      if (legacyFallback()) markCopied();
    });
  }

  return { copied, copy };
}

export function CodeFrame({
  children,
  language,
  filename,
  status,
  statusNode,
  showCopy = true,
  showMeta = true,
  lineCount,
  byteLabel,
  value = "",
  className,
}: CodeFrameProps) {
  const { copied, copy } = useCopyToClipboard(value);

  const footerLeft =
    statusNode !== undefined
      ? statusNode
      : status
        ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 font-medium",
              status.ok ? "text-emerald-400" : "text-rose-400",
            )}
          >
            <span aria-hidden>{status.ok ? "✓" : "✗"}</span>
            <span className="truncate">{status.message}</span>
          </span>
        )
        : null;

  const showFooter = footerLeft !== null || showMeta;

  return (
    <div
      className={cn(
        // Tokyo Night-inspired surface (#421). Outer wrapper holds the body
        // shade; header and footer use a slightly lighter tone.
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#21262d] bg-[#0d1117] shadow-sm",
        className,
      )}
    >
      {/* Header: traffic lights · filename · language badge · copy */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#21262d] bg-[#161b22] px-3 py-2">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="block h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="block h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="block h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {filename ? (
            <span className="truncate font-mono text-[12px] text-neutral-300">
              {filename}
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex h-5 items-center rounded border px-1.5 font-mono text-[10px] font-medium",
              LANGUAGE_BADGE_CLASS[language],
            )}
          >
            {LANGUAGE_LABEL[language]}
          </span>
        </div>
        {showCopy ? (
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-7 items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2 text-[11px] text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy
              </>
            )}
          </button>
        ) : null}
      </div>

      {/* Body slot — caller owns overflow/scroll */}
      {children}

      {/* Footer: status · meta */}
      {showFooter ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#21262d] bg-[#161b22] px-3 py-1.5 text-[11px]">
          <div className="min-w-0 truncate">{footerLeft}</div>
          {showMeta && (lineCount !== undefined || byteLabel !== undefined) ? (
            <div className="whitespace-nowrap text-neutral-500">
              {lineCount !== undefined
                ? `${lineCount} ${lineCount === 1 ? "line" : "lines"}`
                : null}
              {lineCount !== undefined && byteLabel !== undefined ? " · " : null}
              {byteLabel ?? null}
              {LANGUAGE_LABEL[language]
                ? ` · ${LANGUAGE_LABEL[language]}`
                : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
