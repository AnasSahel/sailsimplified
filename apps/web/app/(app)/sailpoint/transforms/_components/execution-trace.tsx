"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Trace } from "@simplified-identity/transforms";

import { TypePill } from "../../../_components/type-pill";
import { highlightJson } from "../../../_components/json-view";

/**
 * Vertical timeline of evaluator trace steps, shared between the
 * transforms editor (`transform-editor.tsx`) and the list-page Test run
 * tab (`transform-drawer.tsx`).
 *
 * Each step is collapsible: by default the row shows the type pill + a
 * compact `[input] → [output]` summary (current v1 view). Expanding via
 * the chevron reveals the step's raw `attrs` as syntax-highlighted JSON
 * — useful to debug "why did this branch fire?" without flipping back to
 * the JSON tab.
 *
 * Layout decision : ADR 2026-05-11-transform-editor-ux-overhaul.md (the
 * numbered-circle + connector visual). Collapsibility added per issue
 * #327 acceptance criterion "Step trace is collapsible per step,
 * syntax-colored values".
 */
export function ExecutionTrace({
  traces,
}: {
  traces: ReadonlyArray<Trace>;
}) {
  if (traces.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline justify-between pb-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Execution trace
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {traces.length} {traces.length === 1 ? "step" : "steps"}
        </span>
      </div>
      <ol className="space-y-2">
        {traces.map((step, i) => (
          <TraceStep
            key={i}
            index={i}
            step={step}
            isLast={i === traces.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

function TraceStep({
  index,
  step,
  isLast,
}: {
  index: number;
  step: Trace;
  isLast: boolean;
}) {
  // Errors take precedence over warnings — a step that threw isn't
  // "advisory", it's broken. Warning only paints the card when the step
  // succeeded but produced a surprising shape.
  const isError = step.error !== undefined;
  const isWarning = !isError && step.warning !== undefined;
  const label = String(index + 1).padStart(2, "0");
  const [expanded, setExpanded] = React.useState(false);

  // Only show the chevron when there's something to expand. `attrs` is
  // always present on a Trace; emptyish records (no keys) are skipped
  // so the chevron doesn't reveal an empty `{}` panel.
  const hasAttrs = Object.keys(step.attrs).length > 0;
  const canExpand = hasAttrs;

  return (
    <li className="flex gap-3">
      {/* Left: numbered circle + connector line */}
      <div className="relative flex w-7 shrink-0 flex-col items-center">
        <div
          className={cn(
            "z-10 flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[10px] font-semibold",
            isError
              ? "border-rose-300 bg-rose-600 text-white"
              : isWarning
                ? "border-amber-300 bg-amber-500 text-white"
                : "border-slate-200 bg-slate-900 text-white dark:border-slate-700 dark:bg-slate-50 dark:text-slate-900",
          )}
          title={step.depth > 0 ? `depth ${step.depth}` : undefined}
        >
          {label}
        </div>
        {!isLast && (
          <div
            aria-hidden
            className="-mt-1 w-px flex-1 bg-slate-200 dark:bg-slate-800"
          />
        )}
      </div>

      {/* Right: collapsible card */}
      <div
        className={cn(
          "min-w-0 flex-1 rounded-md border bg-card p-2.5 pb-3",
          isError
            ? "border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20"
            : isWarning
              ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20"
              : "border-border",
        )}
      >
        <div className="flex items-center justify-between gap-2 pb-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {canExpand ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-label={expanded ? "Collapse step details" : "Expand step details"}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            ) : (
              <span aria-hidden className="inline-block h-5 w-5 shrink-0" />
            )}
            <TypePill type={step.type} />
          </div>
          {step.depth > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground">
              d{step.depth}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <IOBox value={step.input} label="input" />
          <span aria-hidden className="shrink-0 text-muted-foreground">
            →
          </span>
          <IOBox value={step.output} label="output" error={isError} />
        </div>
        {isError && step.error && (
          <p className="pt-1.5 font-mono text-[11px] text-rose-700 dark:text-rose-300">
            {step.error}
          </p>
        )}
        {isWarning && step.warning && (
          <p className="flex items-center gap-1.5 pt-1.5 font-mono text-[11px] text-amber-700 dark:text-amber-300">
            <AlertTriangle aria-hidden className="h-3 w-3 shrink-0" />
            <span>{step.warning}</span>
          </p>
        )}
        {expanded && canExpand && (
          <AttrsPanel attrs={step.attrs} />
        )}
      </div>
    </li>
  );
}

function IOBox({
  value,
  label,
  error,
}: {
  value: string;
  label: string;
  error?: boolean;
}) {
  const isEmpty = value === "" || error;
  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded border px-2 py-1 font-mono text-[11px]",
        isEmpty
          ? "border-dashed border-slate-300 bg-transparent text-slate-400 dark:border-slate-700"
          : "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
      )}
      title={`${label}: ${value}`}
    >
      <span className="block truncate">
        {error ? "ø" : value === "" ? "ø" : value}
      </span>
    </div>
  );
}

/**
 * Expanded view — pretty-printed `attrs` of the step with the same JSON
 * syntax colouring as the Definition `JsonPanel` (shared `highlightJson`).
 * Lets the user inspect "what arguments did this node use" without
 * jumping back to the full transform JSON.
 */
function AttrsPanel({ attrs }: { attrs: Record<string, unknown> }) {
  const html = React.useMemo(
    () => highlightJson(JSON.stringify(attrs, null, 2)),
    [attrs],
  );
  return (
    <div className="mt-2 border-t pt-2">
      <div className="pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Attributes
      </div>
      <pre
        className="overflow-x-auto rounded bg-neutral-900 p-2 font-mono text-[11px] leading-relaxed text-neutral-200"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
