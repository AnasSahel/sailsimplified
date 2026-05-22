import { analyzeSource, runSourceLint } from "@simplified-identity/rules";

/**
 * Server-side source-lint roll-up for the rules list (epic #359, #364).
 *
 * The list page already loads every rule's `sourceCode` inline (one
 * `/v2025/connector-rules` call — see `page.tsx`), so there's no N+1 to avoid
 * and no value in a cached snapshot: we lint the whole set right here during
 * render. `analyzeSource` + `runSourceLint` are pure and cheap (one lex + a few
 * linear scans per rule), and connector-rule inventories are small (dozens),
 * so an inline scan stays well within a server render. The drawer keeps its
 * own live per-rule scan (#363); this is the list-wide aggregate.
 *
 * Pure + isomorphic: no DB, no I/O. Only rules with ≥1 finding land in the map,
 * so callers can treat "absent" as "clean".
 */

export type RuleIssueCount = { errorCount: number; warningCount: number };

type RuleLike = { id: string; sourceCode?: { script: string } | null };

export function computeRuleIssueCounts(
  rules: ReadonlyArray<RuleLike>,
): Map<string, RuleIssueCount> {
  const out = new Map<string, RuleIssueCount>();
  for (const rule of rules) {
    const script = rule.sourceCode?.script;
    if (!script) continue;
    const { errorCount, warningCount } = runSourceLint(rule.id, analyzeSource(script));
    if (errorCount > 0 || warningCount > 0) {
      out.set(rule.id, { errorCount, warningCount });
    }
  }
  return out;
}

/** Aggregate totals over a (filtered) rule set, for the Issues KPI card. */
export function aggregateIssueCounts(
  rules: ReadonlyArray<RuleLike>,
  counts: ReadonlyMap<string, RuleIssueCount>,
): { errorCount: number; warningCount: number; rulesWithIssues: number } {
  let errorCount = 0;
  let warningCount = 0;
  let rulesWithIssues = 0;
  for (const rule of rules) {
    const c = counts.get(rule.id);
    if (!c) continue;
    errorCount += c.errorCount;
    warningCount += c.warningCount;
    rulesWithIssues += 1;
  }
  return { errorCount, warningCount, rulesWithIssues };
}
