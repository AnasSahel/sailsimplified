/**
 * Pure connector-rules lint engine.
 *
 * Iterates `ctx.rules × detectors`, collects every per-rule `Issue`, and
 * passes the precomputed `ctx.unresolvedReferences` (source rule-slot refs
 * not in the connector-rules inventory) through structured for the
 * list-page note. These are kept separate from `errors` — they're not
 * necessarily broken (a reference may be a valid generic cloud rule that's
 * out of v1 scope), so the caller surfaces them neutrally.
 *
 * No async, no I/O, no caching — caching lives in the web shim, the same
 * split as the transforms lint engine. Keeping the engine pure means a
 * future CLI / cron worker can call it the same way the web does.
 */
import type {
  Detector,
  Issue,
  RuleLintContext,
  RuleLintResult,
} from "./types.ts";
import { detectors as defaultDetectors } from "./rules/index.ts";

export function runRuleLint(
  ctx: RuleLintContext,
  detectorsOverride?: ReadonlyArray<Detector>,
): RuleLintResult {
  const active = detectorsOverride ?? defaultDetectors;
  const all: Issue[] = [];

  for (const rule of ctx.rules) {
    for (const detector of active) {
      const found = detector.check(rule, ctx);
      if (found.length > 0) all.push(...found);
    }
  }

  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const byRuleId = new Map<string, Issue[]>();

  for (const issue of all) {
    if (issue.severity === "error") errors.push(issue);
    else warnings.push(issue);
    const bucket = byRuleId.get(issue.ruleId);
    if (bucket) bucket.push(issue);
    else byRuleId.set(issue.ruleId, [issue]);
  }

  return {
    errors,
    warnings,
    byRuleId,
    unresolvedReferences: ctx.unresolvedReferences,
  };
}
