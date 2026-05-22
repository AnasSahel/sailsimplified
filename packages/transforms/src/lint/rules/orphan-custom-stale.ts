/**
 * `orphan-custom-stale` — warning.
 *
 * Flags any **custom** transform that has zero usages AND hasn't been
 * touched in ≥180 days (or whose `modified` field is missing entirely,
 * which we treat as "stale" — better to surface it than to silently
 * exclude it because the list payload didn't carry the timestamp).
 *
 * Built-in transforms (`internal === true`) are never flagged: they ship
 * with the tenant by default, not by user decision, and their lack of
 * usage is irrelevant.
 *
 * Why it matters: custom transforms accumulate over the years (proof of
 * concept, experiment, "we'll come back to it"). Each one is a small
 * cognitive tax on whoever opens the transforms list — and a real risk
 * vector if a stale transform is silently re-enabled later. Flagging
 * them gives the admin a one-click cleanup target.
 */
import type { Issue, LintTransform, Rule } from "../types.ts";

const RULE_ID = "orphan-custom-stale";

/**
 * Stale threshold — a custom transform untouched for this long with zero
 * references is flagged. 180 days = 6 months ≈ two release cycles, long
 * enough that "I'll get back to it next quarter" is no longer credible.
 */
const STALE_THRESHOLD_DAYS = 180;
const STALE_THRESHOLD_MS = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

export const orphanCustomStale: Rule = {
  id: RULE_ID,
  severity: "warning",
  description:
    "Custom transform with zero usages and no edit in the last 180 days (or no recorded edit at all). Likely safe to archive.",
  check: (transform: LintTransform, ctx) => {
    // Built-ins are out of scope — they're tenant defaults, not user
    // decisions, and their orphan status is meaningless.
    if (transform.internal === true) return [];

    // Zero-usage check. SailPoint indexes usages by transform name (not
    // id) — the engine docs this on `TransformUsagesIndex`.
    const usageCount = ctx.usages.get(transform.name)?.length ?? 0;
    if (usageCount > 0) return [];

    // Stale check. Missing `modified` is treated as stale — better a
    // visible warning than silently skipping the transform because the
    // list payload didn't carry the timestamp.
    let isStale = true;
    let detail = "no recorded edit";
    if (transform.modified) {
      const modifiedMs = Date.parse(transform.modified);
      // Date.parse returns NaN on garbage input — treat as stale rather
      // than crash, same defensive stance as the missing case.
      if (!Number.isNaN(modifiedMs)) {
        const ageMs = ctx.now.getTime() - modifiedMs;
        isStale = ageMs >= STALE_THRESHOLD_MS;
        if (isStale) {
          const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
          detail = `last edited ${ageDays} days ago`;
        }
      }
    }
    if (!isStale) return [];

    return [
      {
        ruleId: RULE_ID,
        severity: "warning",
        transformId: transform.id,
        message: `Custom transform with zero usages and ${detail} (threshold: ${STALE_THRESHOLD_DAYS} days). Likely safe to archive.`,
      },
    ];
  },
};
