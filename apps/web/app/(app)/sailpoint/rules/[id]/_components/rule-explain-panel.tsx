"use client";

import * as React from "react";
import { AlertTriangle, Loader2, RefreshCw, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SourceAnalysis } from "@simplified-identity/rules";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "idle"
  | "checking-notice"
  | "notice"
  | "loading"
  | "streaming"
  | "done"
  | "error";

type RuleSignature = {
  input?: Array<{
    name: string;
    type?: string | null;
    description?: string | null;
  }>;
  output?: { name: string; type?: string | null } | null;
};

type Props = {
  ruleType: string;
  sourceCode: string | null | undefined;
  signature: RuleSignature | null | undefined;
  sourceAnalysis: SourceAnalysis | null | undefined;
};

// ── Source analysis summary ───────────────────────────────────────────────────

function summariseAnalysis(a: SourceAnalysis) {
  return {
    lineCount: a.lineCount,
    apiCallCount: a.apiCalls.length,
    loopCount: a.loops.length,
    nullDerefCount: a.nullDerefs.length,
    unusedLocalCount: a.locals.filter((l) => l.references === 0).length,
    maxDepth: a.controlFlow.maxDepth,
    branches: a.controlFlow.branches,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RuleExplainPanel({
  ruleType,
  sourceCode,
  signature,
  sourceAnalysis,
}: Props) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [text, setText] = React.useState("");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  // `true` once we've confirmed from the server that the notice was dismissed
  const [noticeDismissed, setNoticeDismissed] = React.useState<boolean | null>(
    null,
  );

  const abortRef = React.useRef<AbortController | null>(null);

  // Cancel any in-flight request when the component unmounts
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startExplain = React.useCallback(async () => {
    if (!sourceCode) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setText("");
    setErrorMsg(null);
    setPhase("loading");

    try {
      const body: Record<string, unknown> = {
        type: ruleType,
        sourceCode,
        signature: signature ?? null,
      };

      if (sourceAnalysis) {
        body.sourceAnalysis = summariseAnalysis(sourceAnalysis);
      }

      const res = await fetch("/api/sailpoint/rules/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errData = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(
          typeof errData.error === "string"
            ? errData.error
            : `HTTP ${res.status}`,
        );
      }

      setPhase("streaming");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setText((prev) => prev + chunk);
      }

      setPhase("done");
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setErrorMsg(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
      setPhase("error");
    }
  }, [ruleType, sourceCode, signature, sourceAnalysis]);

  const handleExplainClick = React.useCallback(async () => {
    if (noticeDismissed === null) {
      // First click: check notice status from the server
      setPhase("checking-notice");
      try {
        const res = await fetch("/api/sailpoint/rules/explain/notice");
        if (res.ok) {
          const data = (await res.json()) as { dismissed: boolean };
          setNoticeDismissed(data.dismissed);
          if (data.dismissed) {
            await startExplain();
          } else {
            setPhase("notice");
          }
        } else {
          // Fail open: if we can't check, show the notice anyway
          setNoticeDismissed(false);
          setPhase("notice");
        }
      } catch {
        setNoticeDismissed(false);
        setPhase("notice");
      }
    } else if (!noticeDismissed) {
      setPhase("notice");
    } else {
      await startExplain();
    }
  }, [noticeDismissed, startExplain]);

  const handleConfirmNotice = React.useCallback(async () => {
    // Mark dismissed server-side (fire-and-forget; failure is non-fatal)
    fetch("/api/sailpoint/rules/explain/notice", { method: "POST" }).catch(
      () => {},
    );
    setNoticeDismissed(true);
    await startExplain();
  }, [startExplain]);

  const handleCancel = React.useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setText("");
    setErrorMsg(null);
  }, []);

  if (!sourceCode) {
    return (
      <div className="si-caption text-muted-foreground/70">
        Source code not loaded — cannot explain this rule. Open the Edit tab to
        load it.
      </div>
    );
  }

  // ── Idle state — just the trigger button ──────────────────────────────────
  if (phase === "idle") {
    return (
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={handleExplainClick}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Explain with AI
      </Button>
    );
  }

  // ── Checking notice status ─────────────────────────────────────────────────
  if (phase === "checking-notice") {
    return (
      <div className="flex items-center gap-2 si-caption text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Preparing…
      </div>
    );
  }

  // ── Data-egress notice ─────────────────────────────────────────────────────
  if (phase === "notice") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <div className="space-y-2 min-w-0">
            <p className="si-caption font-medium text-amber-900 dark:text-amber-100">
              Data notice — shown once
            </p>
            <p className="si-caption text-amber-800 dark:text-amber-200">
              Clicking <strong>Continue</strong>{" "}sends this rule&apos;s BeanShell
              source code to <strong>Anthropic</strong>{" "}to generate the
              explanation. The code is not stored by Anthropic beyond the
              inference call. This action is per-rule and user-triggered only —
              it never runs automatically.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="default"
                className="gap-1.5"
                onClick={handleConfirmNotice}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Continue
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading / streaming / done / error ────────────────────────────────────
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 si-micro text-muted-foreground">
          {phase === "loading" || phase === "streaming" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              {phase === "loading" ? "Requesting explanation…" : "Streaming…"}
            </>
          ) : phase === "done" ? (
            <>
              <Sparkles className="h-3 w-3 text-violet-500" />
              <span>AI explanation</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {(phase === "done" || phase === "error") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 si-micro"
              onClick={handleExplainClick}
              title="Regenerate explanation"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={handleCancel}
            title="Close explanation"
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Close</span>
          </Button>
        </div>
      </div>

      {phase === "error" ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50/60 px-3 py-2 dark:border-red-900/60 dark:bg-red-950/20">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400"
            aria-hidden
          />
          <p className="si-caption text-red-700 dark:text-red-300">
            {errorMsg}
          </p>
        </div>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border bg-muted/20 px-4 py-3">
          {text ? (
            <MarkdownText text={text} />
          ) : (
            <p className="si-caption text-muted-foreground/50 italic">
              Waiting for response…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Minimal markdown renderer ─────────────────────────────────────────────────
// Handles the subset Claude reliably produces for this prompt:
// numbered lists, bullet lists, bold, inline code, headers.

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="mt-3 mb-1 font-semibold text-sm">
          {renderInline(line.slice(4))}
        </h3>,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="mt-3 mb-1 font-semibold text-sm">
          {renderInline(line.slice(3))}
        </h2>,
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(
        <h2 key={i} className="mt-3 mb-1 font-semibold text-sm">
          {renderInline(line.slice(2))}
        </h2>,
      );
      i++;
      continue;
    }

    // Bullet lists
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: React.ReactNode[] = [];
      while (
        i < lines.length &&
        (lines[i].startsWith("- ") || lines[i].startsWith("* "))
      ) {
        items.push(
          <li key={i}>{renderInline(lines[i].slice(2))}</li>,
        );
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="my-1 ml-4 list-disc space-y-0.5">
          {items}
        </ul>,
      );
      continue;
    }

    // Numbered lists
    const numMatch = /^(\d+)\.\s/.exec(line);
    if (numMatch) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const m = /^\d+\.\s(.*)/.exec(lines[i]);
        items.push(<li key={i}>{renderInline(m ? m[1] : lines[i])}</li>);
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="my-1 ml-4 list-decimal space-y-0.5">
          {items}
        </ol>,
      );
      continue;
    }

    // Paragraph
    nodes.push(
      <p key={i} className="my-1">
        {renderInline(line)}
      </p>,
    );
    i++;
  }

  return <>{nodes}</>;
}

function renderInline(text: string): React.ReactNode {
  // Split on **bold** and `code` spans
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={idx}
          className="rounded bg-muted px-1 py-0.5 font-mono text-xs"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
