/**
 * Neutral (non-"use client") module of option arrays + literal-union
 * types for the Accounts-tab filters on the source detail page. Lives
 * outside the "use client" files so the Server Component page can
 * import the constants without Next serializing them as client refs.
 * See feedback_next_rsc_client_exports.
 *
 * URL contract — all params use the `acc` prefix to avoid clashing with
 * the future schema-tab filters which will use their own prefix:
 *  - `?accq=...`        Free-text search (account name + nativeIdentity).
 *  - `?accstatus=...`   enabled | disabled
 *  - `?accorphan=...`   correlated | orphan
 *  - `?accmgr=...`      yes | no  (managerId present / absent)
 *  - `?accrefresh=...`  24h | 7d | 30d | older  (account.modified bucket)
 */

export const ACCOUNT_STATUS_OPTIONS = [
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
] as const;
export type AccountStatusFilterValue =
  (typeof ACCOUNT_STATUS_OPTIONS)[number]["value"];

export const ACCOUNT_CORRELATION_OPTIONS = [
  { value: "correlated", label: "Correlated" },
  { value: "orphan", label: "Orphan" },
] as const;
export type AccountCorrelationFilterValue =
  (typeof ACCOUNT_CORRELATION_OPTIONS)[number]["value"];

export const ACCOUNT_MANAGER_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;
export type AccountManagerFilterValue =
  (typeof ACCOUNT_MANAGER_OPTIONS)[number]["value"];

export const ACCOUNT_REFRESH_OPTIONS = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "older", label: "Older than 30 days" },
] as const;
export type AccountRefreshFilterValue =
  (typeof ACCOUNT_REFRESH_OPTIONS)[number]["value"];

export const ACCOUNT_FILTER_PARAM_KEYS = [
  "accq",
  "accstatus",
  "accorphan",
  "accmgr",
  "accrefresh",
] as const;

/**
 * Account-attribute keys that connectors use to expose the manager
 * reference. ISC has no canonical name — AD uses `manager` (DN), generic
 * SaaS sources use `managerId`, CSV / DelimitedFile imports occasionally
 * use `manager_id`. Lowercased on both sides at lookup time.
 *
 * Re-used by:
 *  - the schema-presence detection that powers the Manager filter on the
 *    Accounts tab (PR #282 — `detectManagerIdAvailable`).
 *  - the row-level Manager column extraction (issue #261).
 */
export const MANAGER_ATTRIBUTE_NAMES = [
  "manager",
  "managerid",
  "manager_id",
] as const;

/**
 * Best-effort manager-id extraction from an account's `attributes` bag.
 * Returns the first non-empty string found under one of the canonical
 * attribute names (case-insensitive) — connectors vary, the whitelist
 * stays narrow on purpose to avoid false positives (e.g. an unrelated
 * `managerial_grade` column).
 *
 * Returns null when the attribute is absent, empty, or non-string —
 * the Manager column then renders an em-dash, not a link.
 */
export function extractManagerId(
  attributes: Record<string, unknown> | null | undefined,
): string | null {
  if (!attributes) return null;
  // Build a lowercased view once. Cheap for the typical <100-key payload
  // and avoids O(n) per key on the whitelist side.
  for (const [k, v] of Object.entries(attributes)) {
    if (!MANAGER_ATTRIBUTE_NAMES.includes(k.toLowerCase() as never)) continue;
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}
