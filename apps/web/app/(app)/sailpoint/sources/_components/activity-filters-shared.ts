/**
 * Neutral (non-"use client") module of option arrays + literal-union
 * types for the Activity-tab filters on the source detail page. Lives
 * outside the "use client" files so the Server Component page can
 * import the constants without Next serializing them as client refs.
 * See feedback_next_rsc_client_exports.
 *
 * URL contract — all params use the `act` prefix to avoid clashing with
 * the Accounts (`acc`) and future tab filters:
 *  - `?actq=...`         Free-text search (matched against summary).
 *  - `?actactor=...`     any | app-user | isc-system | isc-user | unknown
 *  - `?actaction=...`    Single action key from the v1 whitelist.
 *  - `?actrange=...`     24h | 7d | 30d | 90d | all
 *  - `?actlimit=...`     Page size (default `ACTIVITY_DEFAULT_LIMIT`).
 *  - `?actoffset=...`    Pagination offset (cursor emulated server-side).
 *
 * See ADR `2026-05-14-sources-activity-audit-shape` for the merge/shape
 * rationale. The factory `listSourceActivity` is the source of truth for
 * the runtime types — these option arrays are the UI presentation layer.
 */

import type { ActivityActor } from "@/lib/sailpoint/sources-api";

/**
 * Single-select Actor filter. `any` = no filter; the four other kinds
 * mirror the discriminant of the {@link ActivityActor} type union.
 *
 * The factory accepts a free-form `actor?: string` filter — we map our
 * literal here to that string. Keeping the literal closed-list lets the
 * UI render a dropdown without re-deriving values from the result set.
 */
export const ACTIVITY_ACTOR_OPTIONS = [
  { value: "app-user", label: "App user" },
  { value: "isc-system", label: "ISC system" },
  { value: "isc-user", label: "ISC user" },
  { value: "unknown", label: "Unknown" },
] as const;
export type ActivityActorFilterValue =
  (typeof ACTIVITY_ACTOR_OPTIONS)[number]["value"];

/**
 * Action whitelist for the dropdown. v1 = the 10 app-side audit
 * actions from the ADR + a handful of common ISC event actions.
 * Per ADR D1 the live result set may surface other ISC actions; we
 * still let the user pick from this curated list and pass the raw
 * value to the factory, which forwards it as an opaque string filter.
 *
 * The factory is responsible for matching against either origin's
 * `action` string.
 */
export const ACTIVITY_ACTION_OPTIONS = [
  // App-side (per ADR D1 — the 10 v1 actions).
  { value: "source.renamed", label: "Source renamed" },
  { value: "source.owner_changed", label: "Owner changed" },
  { value: "source.description_updated", label: "Description updated" },
  { value: "source.aggregation_triggered", label: "Aggregation triggered" },
  { value: "source.connection_tested", label: "Connection tested" },
  {
    value: "source.connector_attributes_updated",
    label: "Connector attributes updated",
  },
  { value: "source.schema_drift_detected", label: "Schema drift detected" },
  { value: "source.paused", label: "Source paused" },
  { value: "source.resumed", label: "Source resumed" },
  { value: "source.deleted", label: "Source deleted" },
  // ISC-side (most common events observed against `target.id`).
  { value: "ACCOUNT_AGGREGATION_PASSED", label: "Aggregation passed" },
  { value: "ACCOUNT_AGGREGATION_FAILED", label: "Aggregation failed" },
  { value: "SOURCE_UPDATED", label: "Source updated (ISC)" },
  { value: "SOURCE_DELETED", label: "Source deleted (ISC)" },
] as const;
export type ActivityActionFilterValue =
  (typeof ACTIVITY_ACTION_OPTIONS)[number]["value"];

/**
 * Date-range buckets. `all` clears the range — the factory will fall
 * back to its server-side default (no `from`/`to` arguments).
 */
export const ACTIVITY_RANGE_OPTIONS = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
] as const;
export type ActivityRangeFilterValue =
  (typeof ACTIVITY_RANGE_OPTIONS)[number]["value"];

export const ACTIVITY_DEFAULT_LIMIT = 50;
export const ACTIVITY_MAX_LIMIT = 200;

export const ACTIVITY_FILTER_PARAM_KEYS = [
  "actq",
  "actactor",
  "actaction",
  "actrange",
  "actlimit",
  "actoffset",
] as const;

/**
 * Map a `ActivityActorFilterValue` to the `kind` discriminant used by
 * {@link ActivityActor}. Same string today but kept as a helper so a
 * future label rename on the UI side doesn't bleed into the factory
 * contract.
 */
export function actorFilterToKind(
  value: ActivityActorFilterValue,
): ActivityActor["kind"] {
  return value;
}

/**
 * Compute an ISO cutoff (UTC) for the activity range filter. `all`
 * collapses to `undefined` — the caller should not pass `from` to the
 * factory in that case.
 */
export function activityRangeCutoffIso(
  value: ActivityRangeFilterValue,
): string | undefined {
  if (value === "all") return undefined;
  const now = Date.now();
  const ms =
    value === "24h"
      ? 24 * 60 * 60 * 1000
      : value === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : value === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : 90 * 24 * 60 * 60 * 1000;
  return new Date(now - ms).toISOString();
}
