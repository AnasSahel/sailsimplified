/**
 * `lookup-missing-default` — warning.
 *
 * Flags any `lookup` step whose `attributes.table` doesn't include a
 * `default` key. SailPoint's `lookup` returns `null` silently when the
 * input value matches no key AND no `default` is defined — a recurring
 * production gotcha (the identity attribute ends up empty without a
 * single trace anywhere). Adding `default` to the table forces an
 * explicit fallback decision.
 *
 * Walks the transform tree recursively so a `lookup` nested inside a
 * `firstValid` / `concat` / etc. gets flagged the same way as a
 * top-level one. The pointer encodes the path to the offending step.
 */
import type { Issue, LintTransform, Rule } from "../types.ts";
import { isRecord, walkSteps } from "./_walk.ts";

const RULE_ID = "lookup-missing-default";

/**
 * Returns true when `attributes.table` is an object that contains a
 * `default` key. We accept any value (including `null`) for the default
 * — the warning is "no default declared", not "default is set to X".
 */
function hasDefaultKey(stepAttrs: Record<string, unknown> | undefined): boolean {
  if (!stepAttrs) return false;
  const table = stepAttrs.table;
  if (!isRecord(table)) return false;
  return Object.prototype.hasOwnProperty.call(table, "default");
}

/**
 * Build a single issue for a missing-default lookup at `path`.
 */
function missingDefaultIssue(transform: LintTransform, path: string): Issue {
  return {
    ruleId: RULE_ID,
    severity: "warning",
    transformId: transform.id,
    message:
      "Lookup table has no `default` key — unmatched inputs will silently return null.",
    pointer: `${path}/attributes/table`,
  };
}

export const lookupMissingDefault: Rule = {
  id: RULE_ID,
  severity: "warning",
  description:
    "Transform contains a `lookup` step whose table has no `default` key. Unmatched inputs return null silently — declare a default to make the fallback explicit.",
  check: (transform: LintTransform) => {
    const issues: Issue[] = [];

    // Root-level case: the whole transform is a `lookup`. SailPoint
    // accepts that shape alongside nested-lookup steps.
    if (transform.type === "lookup" && isRecord(transform.attributes)) {
      if (!hasDefaultKey(transform.attributes)) {
        issues.push(missingDefaultIssue(transform, ""));
      }
    }

    // Nested case: walk every sub-step inside `attributes` and flag each
    // `lookup` whose table has no `default`.
    if (transform.attributes) {
      walkSteps(transform.attributes, "/attributes", (step, path) => {
        if (step.type !== "lookup") return;
        const stepAttrs = isRecord(step.attributes) ? step.attributes : undefined;
        if (hasDefaultKey(stepAttrs)) return;
        issues.push(missingDefaultIssue(transform, path));
      });
    }

    return issues;
  },
};
