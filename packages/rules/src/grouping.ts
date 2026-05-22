/**
 * Group connector rules by their `type` for the Rules list page, mirroring
 * `packages/transforms/src/grouping.ts`. The list groups rows under sticky
 * collapsible headers keyed by the raw connector-rule type (`BuildMap`,
 * `WebServiceBeforeOperationRule`, …).
 *
 * Pure: no React, no fetch, no DB. Unit-testable without any web dep.
 *
 *  - **Group key:** the rule's `type`. Same dimension as the Type column
 *    and Type filter — no new concept to learn.
 *  - **Sort:** alphabetical on `type`, with the safety bucket `"unknown"`
 *    (rules with a missing/empty type) always last.
 *  - **Determinism:** intra-group order is preserved from the input.
 */

export type GroupableRule = {
  /** Stable, used as React key by the table. */
  id: string;
  /** Connector-rule type. Optional defensively — empty values bucket
   * into `"unknown"` to keep the contract total. */
  type?: string;
};

export type RuleTypeGroup<T extends GroupableRule> = {
  /** Connector-rule type, e.g. `"BuildMap"`. Falls back to `"unknown"`. */
  type: string;
  /** Convenience — equal to `rules.length`. */
  count: number;
  rules: T[];
};

/** Sentinel bucket for rules with a missing/empty `type`. Rendered last. */
export const UNKNOWN_RULE_TYPE = "unknown";

export function groupRulesByType<T extends GroupableRule>(
  rules: ReadonlyArray<T>,
): RuleTypeGroup<T>[] {
  if (rules.length === 0) return [];

  const buckets = new Map<string, T[]>();
  for (const r of rules) {
    const type = r.type && r.type.length > 0 ? r.type : UNKNOWN_RULE_TYPE;
    const existing = buckets.get(type);
    if (existing) existing.push(r);
    else buckets.set(type, [r]);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => {
      if (a === UNKNOWN_RULE_TYPE) return 1;
      if (b === UNKNOWN_RULE_TYPE) return -1;
      return a.localeCompare(b);
    })
    .map(([type, rs]) => ({ type, count: rs.length, rules: rs }));
}
