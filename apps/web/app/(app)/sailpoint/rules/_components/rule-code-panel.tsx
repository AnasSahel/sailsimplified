"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

/**
 * Read-only BeanShell viewer for a connector rule's `sourceCode.script`
 * (#346). Mirrors the chrome of the transforms `JsonPanel` (dark code
 * block + Copy-to-clipboard) but highlights Java/BeanShell tokens instead
 * of JSON — `highlightJson` only knows JSON, so we use a small,
 * escape-safe regex highlighter here.
 *
 * v1 is read-only; there is no editor. A regex highlighter (not a full
 * parser / CodeMirror instance) keeps the client bundle light for what is
 * a consult-only surface — connector rules are rarely edited and never
 * from this app in v1.
 */
export function RuleCodePanel({ script }: { script: string }) {
  const [copied, setCopied] = React.useState(false);
  const html = React.useMemo(() => highlightBeanShell(script), [script]);

  function copy() {
    function markCopied() {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
    function legacyFallback(): boolean {
      const ta = document.createElement("textarea");
      ta.value = script;
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
    if (!navigator.clipboard) {
      if (legacyFallback()) markCopied();
      return;
    }
    navigator.clipboard.writeText(script).then(markCopied, () => {
      if (legacyFallback()) markCopied();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 z-10 inline-flex h-7 items-center gap-1 rounded border border-neutral-700 bg-neutral-800 px-2 text-[11px] text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100"
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
      <pre
        className="overflow-x-auto rounded-md bg-neutral-900 p-3 font-mono text-[11px] leading-relaxed text-neutral-200"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

const JAVA_KEYWORDS = new Set([
  "abstract", "boolean", "break", "byte", "case", "catch", "char", "class",
  "const", "continue", "default", "do", "double", "else", "enum", "extends",
  "final", "finally", "float", "for", "goto", "if", "implements", "import",
  "instanceof", "int", "interface", "long", "native", "new", "null", "package",
  "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient",
  "try", "void", "volatile", "while", "true", "false",
]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Minimal, escape-safe BeanShell/Java highlighter. Tokenizes in one pass
 * so a keyword inside a string or comment is never re-highlighted. Token
 * order matters: comments and strings are matched before identifiers.
 *
 * Colours use Tailwind-ish inline styles tuned for the dark `bg-neutral-900`
 * block (same palette family as `highlightJson`).
 */
function highlightBeanShell(src: string): string {
  // Single regex with alternation; each branch is a named capture class.
  const token =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d[\d._]*\b)|([A-Za-z_$][\w$]*)/g;

  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = token.exec(src)) !== null) {
    // Emit any plain text between the previous match and this one.
    if (m.index > last) out += escapeHtml(src.slice(last, m.index));
    const [whole, comment, str, num, ident] = m;
    if (comment !== undefined) {
      out += `<span style="color:#6b7280">${escapeHtml(comment)}</span>`;
    } else if (str !== undefined) {
      out += `<span style="color:#86efac">${escapeHtml(str)}</span>`;
    } else if (num !== undefined) {
      out += `<span style="color:#fbbf24">${escapeHtml(num)}</span>`;
    } else if (ident !== undefined) {
      if (JAVA_KEYWORDS.has(ident)) {
        out += `<span style="color:#93c5fd">${escapeHtml(ident)}</span>`;
      } else {
        out += escapeHtml(ident);
      }
    } else {
      out += escapeHtml(whole);
    }
    last = token.lastIndex;
  }
  if (last < src.length) out += escapeHtml(src.slice(last));
  return out;
}
