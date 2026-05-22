/**
 * Pure source-lint engine. Runs every source detector against one rule's
 * `SourceAnalysis` and aggregates findings + severity counts.
 *
 * Single-rule by design (unlike the structural `runRuleLint`, which sweeps the
 * list): the two call sites each lint one script at a time — the drawer lints
 * the selected rule live, the snapshot job lints each rule as it walks the
 * inventory. Counts are returned alongside the issues so the snapshot can
 * store error/warning totals without re-reducing.
 */
import type { Issue } from "../types.ts";
import type { SourceAnalysis } from "../../analysis/index.ts";
import type { SourceDetector, SourceLintResult } from "./types.ts";
import { sourceDetectors as defaultDetectors } from "./detectors/index.ts";

export function runSourceLint(
  ruleId: string,
  analysis: SourceAnalysis,
  detectorsOverride?: ReadonlyArray<SourceDetector>,
): SourceLintResult {
  const active = detectorsOverride ?? defaultDetectors;
  const issues: Issue[] = [];
  for (const detector of active) {
    const found = detector.check({ ruleId, analysis });
    if (found.length > 0) issues.push(...found);
  }
  let errorCount = 0;
  let warningCount = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errorCount++;
    else warningCount++;
  }
  return { issues, errorCount, warningCount };
}
