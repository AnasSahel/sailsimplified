"use client";

import * as React from "react";
import { AlertCircle, Check, Copy } from "lucide-react";

import { Drawer, DrawerHeader } from "@/components/ui/drawer";
import { Pill } from "@/components/ui/pill";
import type { AggregationRun } from "@/lib/sailpoint/sources-api";
import { cn } from "@/lib/utils";

import {
  statusLabel,
  statusTone,
  triggerLabel,
} from "./aggregations-shared";

/**
 * Drawer for a single aggregation run (issue #268). Mirrors the
 * `<TransformDrawer>` shape:
 *
 *  - Header carries the run id (monospace) + the status as a tone pill.
 *  - Three sections: Summary key-value list, Error sample (if any), Raw JSON.
 *  - Raw JSON uses the same dark-block pattern as `<JsonPanel>` but kept
 *    inline here so the component can stay self-contained — the drawer
 *    has no tabs and the JSON sits at the bottom of a scrollable column.
 *
 * Esc-to-close and focus trap come for free via Radix Dialog (the Sheet
 * primitive). The drawer is controlled by `selectedRunId` lifted to the
 * parent tab — clicking a bar or row sets it; clicking the close button
 * or pressing Esc clears it.
 */
export function AggregationDrawer({
  run,
  open,
  onClose,
}: {
  run: AggregationRun | null;
  open: boolean;
  onClose: () => void;
}) {
  // Render an empty drawer body when there's no run — covers the
  // pathological case where the parent passes `open=true` with `run=null`
  // (e.g. a stale id pointing at a run that fell out of the page after a
  // filter change).
  if (!run) {
    return (
      <Drawer
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        title="Aggregation run"
        description="No run selected."
      >
        <div className="flex h-full items-center justify-center si-body text-muted-foreground">
          Run details are no longer available.
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`Aggregation run · ${run.id}`}
      description={`Aggregation of type ${run.type}, status ${run.status}, trigger ${run.trigger}`}
      header={
        <DrawerHeader
          title={
            <span className="flex items-baseline gap-2">
              <span className="text-muted-foreground">Run</span>
              <span className="font-mono">{run.id}</span>
            </span>
          }
          titleBadge={
            <Pill tone={statusTone(run.status)} dot>
              {statusLabel(run.status)}
            </Pill>
          }
          meta={[
            { label: `Type · ${run.type}` },
            { label: `Trigger · ${triggerLabel(run.trigger)}` },
            { label: `Origin · ${run.origin}` },
          ]}
        />
      }
    >
      <div className="space-y-6">
        <SummarySection run={run} />
        {run.errorSample && run.errorSample.length > 0 ? (
          <ErrorSection sample={run.errorSample} />
        ) : null}
        <RawJsonSection run={run} />
      </div>
    </Drawer>
  );
}

// ============================================================
// Summary section
// ============================================================

function SummarySection({ run }: { run: AggregationRun }) {
  const stats = run.stats ?? {};
  return (
    <section>
      <h3 className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Summary
      </h3>
      <dl className="space-y-2 text-sm">
        <Row label="Id">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {run.id}
          </code>
        </Row>
        <Row label="Type">{run.type}</Row>
        <Row label="Status">
          <Pill tone={statusTone(run.status)} dot>
            {statusLabel(run.status)}
          </Pill>
        </Row>
        <Row label="Trigger">{triggerLabel(run.trigger)}</Row>
        <Row label="Origin">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {run.origin}
          </code>
        </Row>
        <Row label="Started">{formatIsoFull(run.startedAt)}</Row>
        <Row label="Completed">
          {run.completedAt ? formatIsoFull(run.completedAt) : <Dash />}
        </Row>
        <Row label="Duration">
          {typeof run.durationSec === "number" ? (
            formatDuration(run.durationSec)
          ) : (
            <Dash />
          )}
        </Row>
        <Row label="Accounts scanned">
          {typeof stats.accountsScanned === "number" ? (
            stats.accountsScanned.toLocaleString()
          ) : (
            <Dash />
          )}
        </Row>
        <Row label="Accounts added">
          {typeof stats.accountsAdded === "number" ? (
            stats.accountsAdded.toLocaleString()
          ) : (
            <Dash />
          )}
        </Row>
        <Row label="Accounts updated">
          {typeof stats.accountsUpdated === "number" ? (
            stats.accountsUpdated.toLocaleString()
          ) : (
            <Dash />
          )}
        </Row>
        <Row label="Accounts deleted">
          {typeof stats.accountsDeleted === "number" ? (
            stats.accountsDeleted.toLocaleString()
          ) : (
            <Dash />
          )}
        </Row>
        <Row label="Errors">
          {typeof stats.errors === "number" ? (
            stats.errors > 0 ? (
              <span className="font-medium text-rose-700 dark:text-rose-300">
                {stats.errors.toLocaleString()}
              </span>
            ) : (
              "0"
            )
          ) : (
            <Dash />
          )}
        </Row>
        <Row label="Warnings">
          {typeof stats.warnings === "number" ? (
            stats.warnings.toLocaleString()
          ) : (
            <Dash />
          )}
        </Row>
      </dl>
    </section>
  );
}

// ============================================================
// Error sample section
// ============================================================

function ErrorSection({
  sample,
}: {
  sample: ReadonlyArray<{ code?: string; message: string }>;
}) {
  return (
    <section>
      <h3 className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Error sample
      </h3>
      <ul className="space-y-1.5">
        {sample.map((err, idx) => (
          <li
            key={idx}
            className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
          >
            <AlertCircle
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              {err.code ? (
                <span className="mr-1.5 font-mono font-medium">{err.code}</span>
              ) : null}
              <span className="whitespace-pre-wrap break-words font-mono">
                {err.message}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ============================================================
// Raw JSON section (copy-to-clipboard)
// ============================================================

function RawJsonSection({ run }: { run: AggregationRun }) {
  const value = React.useMemo(() => JSON.stringify(run, null, 2), [run]);
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

    if (!navigator.clipboard) {
      if (legacyFallback()) markCopied();
      return;
    }
    navigator.clipboard.writeText(value).then(markCopied, () => {
      if (legacyFallback()) markCopied();
    });
  }

  return (
    <section>
      <h3 className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Raw JSON
      </h3>
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
        <pre className="overflow-x-auto rounded-md bg-neutral-900 p-3 font-mono text-[11px] leading-relaxed text-neutral-200">
          {value}
        </pre>
      </div>
    </section>
  );
}

// ============================================================
// Small helpers
// ============================================================

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-baseline gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0")}>{children}</dd>
    </div>
  );
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function formatIsoFull(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mr = m % 60;
  return mr > 0 ? `${h}h ${mr}m` : `${h}h`;
}
