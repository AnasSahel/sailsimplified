/**
 * The **source-detector** contract — distinct from the v1 structural
 * `Detector` (which runs over the whole rule list with no source, keyed on
 * usages/attachment). A source detector reads one rule's `SourceAnalysis` and
 * runs **only where source is loaded**: live in the drawer (#363) and in the
 * snapshot job (#364), never on the list endpoint (which omits `sourceCode`).
 *
 * Keeping the two contracts apart is deliberate: structural detectors need the
 * cross-rule context (usages, unresolved refs); source detectors need only the
 * analysis of a single script. Conflating them would force every source
 * detector to carry an unused tenant-wide context, and vice versa.
 */
import type { Issue, Severity } from "../types.ts";
import type { SourceAnalysis } from "../../analysis/index.ts";

/** Per-rule input to a source detector. */
export type SourceDetectorContext = {
  ruleId: string;
  analysis: SourceAnalysis;
};

/** A pure per-rule source detector. One file under `detectors/`, registered in `detectors/index.ts`. */
export type SourceDetector = {
  id: string;
  severity: Severity;
  /** Plain-English description for the rule reference / tooltip. */
  description: string;
  check: (ctx: SourceDetectorContext) => Issue[];
};

/** Result of running every source detector against one rule's analysis. */
export type SourceLintResult = {
  issues: ReadonlyArray<Issue>;
  errorCount: number;
  warningCount: number;
};
