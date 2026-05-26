"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";
import { highlightJson } from "./json-highlight";
import { escapeHtml, highlightBeanShell } from "../sailpoint/rules/_components/beanshell-highlight";

/**
 * Shared read-only code/JSON viewer (#414).
 *
 * Renders a dark, IDE-like code window with:
 *  - macOS-style traffic-light dots on the top-left (pure chrome, no actions)
 *  - filename label + language badge on the left of the header
 *  - Copy button on the right of the header (toggleable)
 *  - line-numbered, syntax-highlighted source body
 *  - optional footer: status check on the left, `N lines · M B · Language` on the right
 *
 * Replaces the ad-hoc `JsonPanel` / `RuleCodePanel` / inline `<pre className="bg-neutral-900">`
 * patterns that drifted across the app. Wraps the existing
 * `highlightJson` / `highlightBeanShell` helpers — no new highlighter engine.
 *
 * Editable surfaces (`RuleCodeEditor`, transform CodeMirror) are out of scope
 * and stay as-is for now.
 */

export type CodeViewerLanguage = "json" | "beanshell" | "plain";

export type CodeViewerStatus = {
  ok: boolean;
  message: string;
};

export type CodeViewerProps = {
  value: string;
  language: CodeViewerLanguage;
  filename?: string;
  status?: CodeViewerStatus;
  /** Show the Copy button in the header. Default true. */
  showCopy?: boolean;
  /** Show `N lines · M B · Language` on the footer right. Default true. */
  showMeta?: boolean;
  /** Maximum body height (CSS value). Defaults to no max. */
  maxBodyHeight?: string;
  className?: string;
};

const LANGUAGE_LABEL: Record<CodeViewerLanguage, string> = {
  json: "JSON",
  beanshell: "BeanShell",
  plain: "Plain text",
};

const LANGUAGE_BADGE_CLASS: Record<CodeViewerLanguage, string> = {
  json: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  beanshell: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  plain: "bg-neutral-700/40 text-neutral-300 border-neutral-600/50",
};

function highlightFor(language: CodeViewerLanguage, value: string): string {
  switch (language) {
    case "json":
      return highlightJson(value);
    case "beanshell":
      return highlightBeanShell(value);
    case "plain":
    default:
      return escapeHtml(value);
  }
}

/**
 * Split a highlighter's HTML output into one HTML chunk per source line.
 *
 * The BeanShell highlighter emits multi-line spans for block comments
 * (`/* ... *​/` crossing newlines). A naive `html.split("\n")` would leave
 * unclosed `<span>` tags on each line, breaking rendering. This walker
 * tracks the open-tag stack: at every `\n` it closes the stack, emits the
 * line, and re-opens the stack on the next line — so each line is a
 * self-contained, well-formed HTML chunk safe to drop in its own
 * `dangerouslySetInnerHTML` container.
 */
function splitHighlightedByLines(html: string): string[] {
  const lines: string[] = [];
  let current = "";
  const openTags: string[] = [];
  let i = 0;

  while (i < html.length) {
    const ch = html[i];
    if (ch === "<") {
      const end = html.indexOf(">", i);
      if (end === -1) {
        // Unterminated tag — bail and dump the rest as-is.
        current += html.slice(i);
        break;
      }
      const tag = html.slice(i, end + 1);
      if (tag.startsWith("</")) {
        openTags.pop();
      } else if (!tag.endsWith("/>")) {
        openTags.push(tag);
      }
      current += tag;
      i = end + 1;
    } else if (ch === "\n") {
      // Close every open span before the newline, push the line, reopen on next.
      current += openTags.map(() => "</span>").join("");
      lines.push(current);
      current = openTags.join("");
      i += 1;
    } else {
      current += ch;
      i += 1;
    }
  }
  lines.push(current);
  return lines;
}

function formatByteSize(value: string): string {
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
      // Last-resort for browsers without the Clipboard API or insecure contexts.
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

export function CodeViewer({
  value,
  language,
  filename,
  status,
  showCopy = true,
  showMeta = true,
  maxBodyHeight,
  className,
}: CodeViewerProps) {
  const highlightedLines = React.useMemo(() => {
    const html = highlightFor(language, value);
    return splitHighlightedByLines(html);
  }, [language, value]);

  const lineCount = highlightedLines.length;
  const byteLabel = React.useMemo(() => formatByteSize(value), [value]);
  const { copied, copy } = useCopyToClipboard(value);

  const showFooter = Boolean(status) || showMeta;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-sm",
        className,
      )}
    >
      {/* Header: traffic lights · filename · language badge · copy */}
      <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 py-2">
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

      {/* Body: gutter + highlighted source */}
      <div
        className="overflow-auto bg-neutral-900 font-mono text-[11px] leading-relaxed text-neutral-200"
        style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
      >
        <table className="min-w-full border-separate border-spacing-0">
          <tbody>
            {highlightedLines.map((lineHtml, idx) => (
              <tr key={idx}>
                <td
                  className="select-none whitespace-nowrap pr-3 pl-3 text-right align-top text-neutral-600"
                  aria-hidden
                >
                  {idx + 1}
                </td>
                <td
                  className="w-full whitespace-pre pr-3 align-top"
                  dangerouslySetInnerHTML={{ __html: lineHtml || " " }}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: status · meta */}
      {showFooter ? (
        <div className="flex items-center justify-between gap-3 border-t border-neutral-800 bg-neutral-900 px-3 py-1.5 text-[11px]">
          <div className="min-w-0 truncate">
            {status ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-medium",
                  status.ok ? "text-emerald-400" : "text-rose-400",
                )}
              >
                <span aria-hidden>{status.ok ? "✓" : "✗"}</span>
                <span className="truncate">{status.message}</span>
              </span>
            ) : null}
          </div>
          {showMeta ? (
            <div className="whitespace-nowrap text-neutral-500">
              {lineCount} {lineCount === 1 ? "line" : "lines"} · {byteLabel} ·{" "}
              {LANGUAGE_LABEL[language]}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
