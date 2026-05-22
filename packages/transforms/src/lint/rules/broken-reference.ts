/**
 * `broken-reference` — error.
 *
 * Flags any `reference` step whose target name is not present in the
 * tenant's transform graph. SailPoint references a transform by **name**,
 * not by id (cf. `usages.ts`), so we compare against `ctx.graph` which
 * holds the set of valid transform names.
 *
 * Why it matters: a deleted-but-still-referenced transform makes the
 * identity refresh fail the next morning. The error is silent at delete
 * time — SailPoint accepts the DELETE without checking incoming refs
 * (cf. `deleteTransform` in `sailpoint-client/transforms-api.ts`).
 *
 * Walks the transform tree recursively so a `reference` nested deep
 * inside a `firstValid` / `concat` / lookup-input gets flagged the same
 * way as a top-level one. The pointer encodes the path to the offending
 * step so the drawer can highlight it (e.g. `/attributes/values/2`).
 */
import type { Issue, LintTransform, Rule } from "../types.ts";
import { isRecord, walkSteps } from "./_walk.ts";

const RULE_ID = "broken-reference";

export const brokenReference: Rule = {
  id: RULE_ID,
  severity: "error",
  description:
    "Transform contains a `reference` step pointing at a transform that does not exist in this tenant. Identity refresh will fail when the chain is evaluated.",
  check: (transform: LintTransform, ctx) => {
    const issues: Issue[] = [];

    // Root-level case: the whole transform is itself of type "reference",
    // with `attributes.id` naming the target. SailPoint allows this shape
    // alongside nested-reference steps.
    if (transform.type === "reference" && isRecord(transform.attributes)) {
      const refName =
        typeof transform.attributes.id === "string"
          ? transform.attributes.id
          : undefined;
      if (refName && !ctx.graph.has(refName)) {
        issues.push({
          ruleId: RULE_ID,
          severity: "error",
          transformId: transform.id,
          message: `Reference to "${refName}" which does not exist.`,
          pointer: "/attributes/id",
        });
      }
    }

    // Nested case: walk every sub-step inside `attributes` and flag each
    // `reference` whose target name is unknown.
    if (transform.attributes) {
      walkSteps(transform.attributes, "/attributes", (step, path) => {
        if (step.type !== "reference") return;
        const stepAttrs = isRecord(step.attributes) ? step.attributes : undefined;
        const refName =
          stepAttrs && typeof stepAttrs.id === "string" ? stepAttrs.id : undefined;
        if (!refName) return;
        if (ctx.graph.has(refName)) return;
        issues.push({
          ruleId: RULE_ID,
          severity: "error",
          transformId: transform.id,
          message: `Reference to "${refName}" which does not exist.`,
          pointer: `${path}/attributes/id`,
        });
      });
    }

    return issues;
  },
};
