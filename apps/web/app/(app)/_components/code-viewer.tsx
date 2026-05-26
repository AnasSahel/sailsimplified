"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { highlightJson } from "./json-highlight";
import { escapeHtml, highlightBeanShell } from "../sailpoint/rules/_components/beanshell-highlight";
import {
  CodeFrame,
  formatByteSize,
  type CodeFrameLanguage,
  type CodeFrameStatus,
} from "./code-frame";

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
 * Chrome is provided by `CodeFrame` (#419) so editable surfaces share the
 * same visual shell. The `splitHighlightedByLines` helper and syntax
 * highlighting live here — read-only concerns not needed by editable surfaces.
 *
 * Editable surfaces (`RuleCodeEditor`, `RawJsonEditor`) wrap their own
 * bodies in `CodeFrame` directly.
 */

export type CodeViewerLanguage = CodeFrameLanguage;
export type CodeViewerStatus = CodeFrameStatus;

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

  return (
    <CodeFrame
      language={language}
      filename={filename}
      status={status}
      showCopy={showCopy}
      showMeta={showMeta}
      lineCount={lineCount}
      byteLabel={byteLabel}
      value={value}
      className={className}
    >
      {/* Body: gutter + highlighted source */}
      <div
        className={cn(
          "flex-1 min-h-0 overflow-auto bg-neutral-900 font-mono text-[11px] leading-relaxed text-neutral-200",
        )}
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
                  dangerouslySetInnerHTML={{ __html: lineHtml || " " }}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CodeFrame>
  );
}
