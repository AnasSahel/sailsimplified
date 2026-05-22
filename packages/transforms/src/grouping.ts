/**
 * Group transforms by their root SailPoint `type` for the Transforms List
 * page (`lookup`, `firstValid`, `concat`, `displayName`, `static`,
 * `e164phone`, etc.).
 *
 * Decisions are locked by the ADR
 * `vault/Projects/Simplified Identity/2026-05-14-transforms-list-grouping-by-type.md`,
 * which supersedes the prefix-based grouping rejected at pixel review.
 *
 *   - **Q1 — Group key:** the transform's root `type`. Mirrors the
 *     existing `Type` column and `Type` filter chip — no new dimension
 *     to learn. Mental model: "show me all my lookups, all my
 *     firstValids".
 *
 *   - **Q2 — Cap & overflow:** none. ISC exposes ~15-20 distinct types,
 *     so there is no risk of group explosion. A new ISC type just
 *     materialises as its own group.
 *
 *   - **Sort:** alphabetical on `type`, with the safety bucket
 *     `"unknown"` (transforms without a `type`) always last.
 *
 *   - **Determinism:** the order of transforms inside a group is
 *     preserved from the input. Callers that want a specific intra-group
 *     order should sort upstream.
 *
 * Pure: no React, no fetch, no DB. Only arrays and maps. Lives in the
 * `transforms` package so it can be unit-tested without any web dep.
 */

export type GroupableTransform = {
  /** Stable, used as React key by the table. */
  id: string;
  /** Root SailPoint transform type. Optional defensively — missing/empty
   * values bucket into `"unknown"` to keep the contract total. */
  type?: string;
};

export type TypeGroup<T extends GroupableTransform> = {
  /** Root transform type, e.g. `"lookup"`, `"firstValid"`,
   * `"displayName"`. Falls back to `"unknown"` when `type` is missing. */
  type: string;
  /** Convenience — equal to `transforms.length`. */
  count: number;
  transforms: T[];
};

/** Sentinel bucket for transforms with a missing/empty `type`. Always
 * rendered last per the ADR. Should be empty in practice — ISC always
 * returns a `type` — but kept as a safety to keep the function total. */
export const UNKNOWN_TYPE = "unknown";

/**
 * Bucket transforms strictly by their root `type`. The returned list is
 * alphabetically sorted by type, with `"unknown"` (when present) always
 * last. Empty input yields an empty array.
 */
export function groupTransformsByType<T extends GroupableTransform>(
  transforms: ReadonlyArray<T>,
): TypeGroup<T>[] {
  if (transforms.length === 0) return [];

  // Bucket — preserve insertion order inside each group.
  const buckets = new Map<string, T[]>();
  for (const t of transforms) {
    const type = t.type && t.type.length > 0 ? t.type : UNKNOWN_TYPE;
    const existing = buckets.get(type);
    if (existing) {
      existing.push(t);
    } else {
      buckets.set(type, [t]);
    }
  }

  // Render order — alphabetical on type, "unknown" pinned last.
  return Array.from(buckets.entries())
    .sort(([a], [b]) => {
      if (a === UNKNOWN_TYPE) return 1;
      if (b === UNKNOWN_TYPE) return -1;
      return a.localeCompare(b);
    })
    .map(([type, ts]) => ({ type, count: ts.length, transforms: ts }));
}
