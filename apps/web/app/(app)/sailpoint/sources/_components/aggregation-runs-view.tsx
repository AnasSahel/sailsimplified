"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AggregationRun } from "@/lib/sailpoint/sources-api";
import { cn } from "@/lib/utils";

import { AggregationDrawer } from "./aggregation-drawer";
import {
  MAX_CHART_BARS,
  RUNS_PAGE_SIZE,
  statusBarClass,
  statusLabel,
  statusTone,
  triggerLabel,
} from "./aggregations-shared";

/**
 * Client wrapper for the bar chart + paginated table on the Aggregations
 * tab. Owns the drawer's open-run state — both the chart and the table
 * call `setSelected(runId)`.
 *
 * Pagination is URL-driven (`?runpage=`) so deep-links restore the
 * scrolled-to page. The chart always shows the last N runs from the
 * current filtered set regardless of page — runs in chronological order
 * are more useful for trend detection than runs in the current table slice.
 */
export function AggregationRunsView({
  runs,
  page,
  pageHrefFor,
}: {
  runs: ReadonlyArray<AggregationRun>;
  page: number;
  pageHrefFor: (page: number) => string;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Runs ordered newest-first for the table (default sort). The chart
  // re-orders them oldest-first so time flows left-to-right.
  const newestFirst = React.useMemo(() => {
    return [...runs].sort((a, b) => {
      const ta = new Date(a.startedAt).getTime();
      const tb = new Date(b.startedAt).getTime();
      return tb - ta;
    });
  }, [runs]);

  const chartRuns = React.useMemo(() => {
    // Chart shows the most recent N runs in time order (oldest left).
    const slice = newestFirst.slice(0, MAX_CHART_BARS);
    return [...slice].reverse();
  }, [newestFirst]);

  // URL-driven pagination — clamp the requested page to a valid range.
  const totalPages = Math.max(1, Math.ceil(newestFirst.length / RUNS_PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = newestFirst.slice(
    (clampedPage - 1) * RUNS_PAGE_SIZE,
    clampedPage * RUNS_PAGE_SIZE,
  );

  const selected = React.useMemo(
    () => newestFirst.find((r) => r.id === selectedId) ?? null,
    [newestFirst, selectedId],
  );

  return (
    <div className="space-y-4">
      <RunsBarChart runs={chartRuns} onSelect={setSelectedId} />
      <RunsTable
        runs={pageRows}
        onSelect={setSelectedId}
        page={clampedPage}
        totalPages={totalPages}
        totalRows={newestFirst.length}
        pageHrefFor={pageHrefFor}
      />
      <AggregationDrawer
        run={selected}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

// ============================================================
// Bar chart — inline SVG
// ============================================================

const CHART_HEIGHT = 80;
const BAR_WIDTH = 16;
const BAR_GAP = 4;
const BAR_RADIUS = 2;
const MIN_BAR = 3; // baseline so 0-duration runs (running / no data) still render
const X_AXIS_LABEL_HEIGHT = 16;

function RunsBarChart({
  runs,
  onSelect,
}: {
  runs: ReadonlyArray<AggregationRun>;
  onSelect: (id: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center si-caption text-muted-foreground">
        No runs to plot in the current filter window.
      </div>
    );
  }

  // Auto-scale on the max non-zero duration. Falls back to 1 so the
  // `MIN_BAR` baseline still applies when every run is in-flight with
  // `durationSec` unset.
  const maxDuration = runs.reduce((acc, r) => {
    const d = r.durationSec ?? 0;
    return d > acc ? d : acc;
  }, 0);
  const scale = maxDuration > 0 ? maxDuration : 1;

  const innerWidth = runs.length * BAR_WIDTH + (runs.length - 1) * BAR_GAP;
  const totalHeight = CHART_HEIGHT + X_AXIS_LABEL_HEIGHT;

  // Pick three index points for time labels: first / middle / last.
  // We render labels under the X axis only on those three indices to
  // keep the strip readable.
  const labeledIdx = new Set<number>([
    0,
    Math.floor((runs.length - 1) / 2),
    runs.length - 1,
  ]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between pb-3">
        <h2 className="text-sm font-medium">
          Last {runs.length} {runs.length === 1 ? "run" : "runs"}
        </h2>
        <span className="si-caption text-muted-foreground">
          Bar height = duration · colour = outcome
        </span>
      </div>
      <div className="w-full overflow-x-auto">
        <svg
          width={innerWidth}
          height={totalHeight}
          viewBox={`0 0 ${innerWidth} ${totalHeight}`}
          role="img"
          aria-label={`Bar chart of the last ${runs.length} aggregation runs.`}
          className="block"
        >
          {/* Baseline */}
          <line
            x1={0}
            y1={CHART_HEIGHT}
            x2={innerWidth}
            y2={CHART_HEIGHT}
            className="stroke-border"
            strokeWidth={1}
          />
          {runs.map((run, i) => {
            const x = i * (BAR_WIDTH + BAR_GAP);
            const dur = run.durationSec ?? 0;
            // Scale to chart height, with a floor so the bar is always
            // visible (otherwise a 0-second / in-flight run renders as a
            // 0-height invisible rect, leaving a gap in the timeline).
            const scaledHeight = Math.max(
              MIN_BAR,
              Math.round((dur / scale) * (CHART_HEIGHT - 4)),
            );
            const y = CHART_HEIGHT - scaledHeight;

            const tooltip = [
              formatIsoShort(run.startedAt),
              typeof run.durationSec === "number"
                ? `${formatDurationCompact(run.durationSec)}`
                : "duration unavailable",
              statusLabel(run.status),
            ].join(" · ");

            const isLabeled = labeledIdx.has(i);
            return (
              <g key={run.id} className="cursor-pointer">
                <rect
                  x={x}
                  y={y}
                  width={BAR_WIDTH}
                  height={scaledHeight}
                  rx={BAR_RADIUS}
                  className={cn(
                    "transition-colors",
                    statusBarClass(run.status),
                  )}
                  onClick={() => onSelect(run.id)}
                  // Native SVG <title> renders as a hover tooltip in all
                  // browsers we care about. Cheap, accessible, no
                  // third-party tooltip lib.
                >
                  <title>{tooltip}</title>
                </rect>
                {isLabeled ? (
                  <text
                    x={x + BAR_WIDTH / 2}
                    y={CHART_HEIGHT + X_AXIS_LABEL_HEIGHT - 4}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: 10 }}
                  >
                    {formatTimeLabel(run.startedAt)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

// ============================================================
// Table — paginated, URL-driven
// ============================================================

function RunsTable({
  runs,
  onSelect,
  page,
  totalPages,
  totalRows,
  pageHrefFor,
}: {
  runs: ReadonlyArray<AggregationRun>;
  onSelect: (id: string) => void;
  page: number;
  totalPages: number;
  totalRows: number;
  pageHrefFor: (page: number) => string;
}) {
  if (runs.length === 0) {
    return null;
  }

  const rangeStart = (page - 1) * RUNS_PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * RUNS_PAGE_SIZE + runs.length;
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">Runs</h2>
        <span className="si-caption text-muted-foreground tabular-nums">
          {rangeStart}–{rangeEnd} of {totalRows}
        </span>
      </header>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Started at</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead className="text-right">Accounts</TableHead>
            <TableHead className="text-right">Errors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow
              key={run.id}
              className="cursor-pointer"
              onClick={() => onSelect(run.id)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(run.id);
                }
              }}
            >
              <TableCell className="font-mono text-xs">
                {formatIsoShort(run.startedAt)}
              </TableCell>
              <TableCell className="text-xs">
                {triggerLabel(run.trigger)}
              </TableCell>
              <TableCell>
                <Pill tone={statusTone(run.status)} dot>
                  {statusLabel(run.status)}
                </Pill>
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {typeof run.durationSec === "number" ? (
                  formatDurationCompact(run.durationSec)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {typeof run.stats?.accountsScanned === "number" ? (
                  run.stats.accountsScanned.toLocaleString()
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-xs tabular-nums">
                {typeof run.stats?.errors === "number" ? (
                  run.stats.errors > 0 ? (
                    <span className="font-medium text-rose-700 dark:text-rose-300">
                      {run.stats.errors.toLocaleString()}
                    </span>
                  ) : (
                    "0"
                  )
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-1 border-t px-4 py-2">
          <PaginatorLink
            href={pageHrefFor(page - 1)}
            disabled={prevDisabled}
            label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </PaginatorLink>
          <span className="px-2 si-caption text-muted-foreground tabular-nums">
            Page {page} of {totalPages}
          </span>
          <PaginatorLink
            href={pageHrefFor(page + 1)}
            disabled={nextDisabled}
            label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </PaginatorLink>
        </div>
      ) : null}
    </section>
  );
}

function PaginatorLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const cls = cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    "h-7 w-7 p-0",
    disabled && "pointer-events-none opacity-40",
  );
  if (disabled) {
    return (
      <span aria-disabled className={cls} aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={cls} aria-label={label}>
      {children}
    </Link>
  );
}

// ============================================================
// Date / duration formatting
// ============================================================

function formatIsoShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  // YYYY-MM-DD HH:MM in local time. Compact enough for a table cell,
  // detailed enough to disambiguate same-day runs.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  // MM-DD only — the chart strip is narrow and the hours add no value
  // at the labelled-edges resolution.
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDurationCompact(sec: number): string {
  if (sec < 1) return `${Math.round(sec * 1000)}ms`;
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mr = m % 60;
  return mr > 0 ? `${h}h ${mr}m` : `${h}h`;
}
