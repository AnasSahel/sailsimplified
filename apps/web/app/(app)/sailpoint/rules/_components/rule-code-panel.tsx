"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { highlightBeanShell } from "./beanshell-highlight";

/**
 * Read-only BeanShell viewer for a connector rule's `sourceCode.script`
 * (#346). Mirrors the chrome of the transforms `JsonPanel` (dark code
 * block + Copy-to-clipboard) but highlights Java/BeanShell tokens instead
 * of JSON — `highlightJson` only knows JSON, so we use a small,
 * escape-safe regex highlighter (`./beanshell-highlight`, shared with the
 * editable `RuleCodeEditor`).
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
