/**
 * Small shared helpers for source detectors — kept out of the analysis layer
 * so `SourceAnalysis` stays a pure data model.
 */
import type { SourceAnalysis } from "../../analysis/index.ts";
import type { Issue, IssueLocation, Severity } from "../types.ts";

/** Trimmed source line (1-based), capped so a banner stays one line. */
export function snippetForLine(script: string, line: number, max = 120): string | undefined {
  const lines = script.split("\n");
  const raw = lines[line - 1];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** Build an `IssueLocation` with the snippet filled in from the analysed script. */
export function locationAt(analysis: SourceAnalysis, line: number): IssueLocation {
  return { line, snippet: snippetForLine(analysis.script, line) };
}

/** Construct a located source `Issue` — every source detector emits through this. */
export function sourceIssue(args: {
  ruleId: string;
  detectorId: string;
  severity: Severity;
  message: string;
  analysis: SourceAnalysis;
  line: number;
}): Issue {
  return {
    ruleId: args.ruleId,
    detectorId: args.detectorId,
    severity: args.severity,
    message: args.message,
    location: locationAt(args.analysis, args.line),
  };
}
