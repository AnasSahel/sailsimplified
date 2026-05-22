/**
 * Pure lint engine entry point.
 *
 * Iterates `ctx.transforms` × `rules`, collects every `Issue` emitted,
 * and aggregates them three ways: a flat `errors` array, a flat
 * `warnings` array, and a `byTransformId` map for per-transform views
 * (the drawer needs O(1) access to "issues for THIS transform").
 *
 * No async, no I/O, no caching — caching lives in the `apps/web` shim
 * (`lint-runner.ts`, lands in PR #2). Keeping the engine pure means a
 * future CLI / cron worker can call it the same way the web does.
 */
import type { Issue, LintContext, LintResult, Rule } from "./types.ts";
import { rules as defaultRules } from "./rules/index.ts";

/**
 * Run every registered rule against every transform in the context and
 * return the aggregated result.
 *
 * `rulesOverride` is a hook for tests and for future per-tenant rule
 * tuning (not used in v1, but cheaper to expose now than to refactor
 * later — and it makes the engine trivially testable in isolation
 * from the registry).
 */
export function runLint(
  ctx: LintContext,
  rulesOverride?: ReadonlyArray<Rule>,
): LintResult {
  const activeRules = rulesOverride ?? defaultRules;
  const all: Issue[] = [];

  for (const transform of ctx.transforms) {
    for (const rule of activeRules) {
      const found = rule.check(transform, ctx);
      if (found.length > 0) all.push(...found);
    }
  }

  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const byTransformId = new Map<string, Issue[]>();

  for (const issue of all) {
    if (issue.severity === "error") errors.push(issue);
    else warnings.push(issue);

    const bucket = byTransformId.get(issue.transformId);
    if (bucket) bucket.push(issue);
    else byTransformId.set(issue.transformId, [issue]);
  }

  return { errors, warnings, byTransformId };
}
