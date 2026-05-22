import type {
  AggregationRunStatus,
  AggregationRunTrigger,
} from "@/lib/sailpoint/sources-api";

/**
 * Shared filter options + URL helpers for the Aggregations tab (issue #268).
 *
 * Lives in a `*-shared.ts` (server-import-safe) module so the page can validate
 * URL params and pre-resolve filter expressions without dragging the
 * client-side filter components onto the server.
 */

export type RangeValue = "24h" | "7d" | "30d" | "90d";

export const AGGREGATION_RANGE_OPTIONS: ReadonlyArray<{
  value: RangeValue;
  label: string;
}> = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

export const DEFAULT_RANGE: RangeValue = "30d";

export const AGGREGATION_STATUS_OPTIONS: ReadonlyArray<{
  value: AggregationRunStatus;
  label: string;
}> = [
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "running", label: "Running" },
  { value: "terminated", label: "Terminated" },
];

export const AGGREGATION_TRIGGER_OPTIONS: ReadonlyArray<{
  value: AggregationRunTrigger;
  label: string;
}> = [
  { value: "manual", label: "Manual" },
  { value: "scheduled", label: "Scheduled" },
  { value: "api", label: "API" },
  { value: "unknown", label: "Unknown" },
];

const VALID_RANGE_VALUES = new Set<RangeValue>(
  AGGREGATION_RANGE_OPTIONS.map((o) => o.value),
);
const VALID_STATUS_VALUES = new Set<AggregationRunStatus>(
  AGGREGATION_STATUS_OPTIONS.map((o) => o.value),
);
const VALID_TRIGGER_VALUES = new Set<AggregationRunTrigger>(
  AGGREGATION_TRIGGER_OPTIONS.map((o) => o.value),
);

export function rangeFromParam(value: string | undefined): RangeValue {
  if (!value) return DEFAULT_RANGE;
  const v = value.toLowerCase() as RangeValue;
  return VALID_RANGE_VALUES.has(v) ? v : DEFAULT_RANGE;
}

export function statusFromParam(
  value: string | undefined,
): AggregationRunStatus | null {
  if (!value) return null;
  const v = value.toLowerCase() as AggregationRunStatus;
  return VALID_STATUS_VALUES.has(v) ? v : null;
}

export function triggerFromParam(
  value: string | undefined,
): AggregationRunTrigger | null {
  if (!value) return null;
  const v = value.toLowerCase() as AggregationRunTrigger;
  return VALID_TRIGGER_VALUES.has(v) ? v : null;
}

/**
 * Maximum number of bars rendered in the chart. Issue #268 caps at 30
 * — beyond that the chart loses legibility on a single row and the user
 * is better served by the table beneath it.
 */
export const MAX_CHART_BARS = 30;

export const RUNS_PAGE_SIZE = 25;

/**
 * Map an `AggregationRunStatus` to the closed Pill tone set.
 * `running` reuses `info` (sky); `terminated` collapses to `neutral`.
 */
export function statusTone(
  status: AggregationRunStatus,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "danger";
    case "running":
      return "info";
    case "terminated":
      return "neutral";
  }
}

export function statusLabel(status: AggregationRunStatus): string {
  switch (status) {
    case "success":
      return "Success";
    case "warning":
      return "Warning";
    case "error":
      return "Error";
    case "running":
      return "Running";
    case "terminated":
      return "Terminated";
  }
}

export function triggerLabel(trigger: AggregationRunTrigger): string {
  switch (trigger) {
    case "manual":
      return "Manual";
    case "scheduled":
      return "Scheduled";
    case "api":
      return "API";
    case "unknown":
      return "Unknown";
  }
}

/**
 * Bar fill colour for the chart. Tailwind tokens picked to mirror Pill
 * tones so chart + table share a visual vocabulary.
 */
export function statusBarClass(status: AggregationRunStatus): string {
  switch (status) {
    case "success":
      return "fill-emerald-500 hover:fill-emerald-600";
    case "warning":
      return "fill-amber-500 hover:fill-amber-600";
    case "error":
      return "fill-rose-500 hover:fill-rose-600";
    case "running":
      return "fill-sky-400 hover:fill-sky-500";
    case "terminated":
      return "fill-neutral-400 hover:fill-neutral-500";
  }
}
