/**
 * `unattached-rule` — warning.
 *
 * Flags any connector rule that no source references. A connector rule
 * only ever executes when a source invokes it (during aggregation or
 * provisioning) — an unattached rule is dead code: it costs nothing at
 * runtime but pollutes the inventory and is a latent risk if a source is
 * later wired to it by mistake.
 *
 * Connector rules are attached **by id** (the source's typed rule slots
 * and connector bags carry the rule id), so we look the rule up in the
 * usages map by `rule.id` — unlike transforms, which are referenced by
 * name.
 */
import type { Detector, Issue, LintableRule } from "../types.ts";

const DETECTOR_ID = "unattached-rule";

export const unattachedRule: Detector = {
  id: DETECTOR_ID,
  severity: "warning",
  description:
    "Connector rule that no source references. It never executes — likely safe to archive, or a source wiring was missed.",
  check: (rule: LintableRule, ctx): Issue[] => {
    const attachedSources = ctx.usages.get(rule.id)?.length ?? 0;
    if (attachedSources > 0) return [];
    return [
      {
        ruleId: rule.id,
        detectorId: DETECTOR_ID,
        severity: "warning",
        message:
          "Not attached to any source. This rule never executes — archive it, or wire the source that should use it.",
      },
    ];
  },
};
