"use client";

import * as React from "react";
import { AlertTriangle, CircleAlert, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { analyzeSource, runSourceLint, type Issue } from "@simplified-identity/rules";

/**
 * Live per-rule source-hygiene banner (#363 / epic #359 v2 lint).
 *
 * The drawer already has the rule's `sourceCode` loaded, so we lint it on the
 * client — no extra fetch, no snapshot. `analyzeSource` + `runSourceLint` are
 * pure and cheap (one lex + linear scans), and memoised on the script so a
 * re-render doesn't re-lint. The list-wide Issues KPI is the snapshot's job
 * (#364); this is the always-current view of the rule you're looking at.
 *
 * Each finding deep-links into the editor at its line via `onFix` — that's the
 * fix-in-editor handoff to authoring (#350): the drawer flips to edit mode and
 * drops the caret on the offending line.
 */
export function RuleIssuesBanner({
  ruleId,
  script,
  onFix,
}: {
  ruleId: string;
  script: string;
  /** Open the editor with the caret on `line`. */
  onFix: (line: number) => void;
}) {
  const result = React.useMemo(
    () => runSourceLint(ruleId, analyzeSource(script)),
    [ruleId, script],
  );

  if (result.issues.length === 0) {
    return (
      <p className="inline-flex items-center gap-1.5 si-caption text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> No source issues detected.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {result.issues.map((issue, i) => (
        <IssueRow key={`${issue.detectorId}-${i}`} issue={issue} onFix={onFix} />
      ))}
    </ul>
  );
}

/** Compact "N errors · M warnings" label — reused in the Section heading. */
export function issuesSummary(errorCount: number, warningCount: number): string {
  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`);
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** Lint one script and return its severity counts (for the Section heading). */
export function summarizeSource(ruleId: string, script: string) {
  const { errorCount, warningCount } = runSourceLint(ruleId, analyzeSource(script));
  return { errorCount, warningCount };
}

function IssueRow({ issue, onFix }: { issue: Issue; onFix: (line: number) => void }) {
  const isError = issue.severity === "error";
  const line = issue.location?.line;
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2",
        isError
          ? "border-rose-200 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20"
          : "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20",
      )}
    >
      {isError ? (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      )}
      <div className="min-w-0 space-y-1">
        <p
          className={cn(
            "si-caption",
            isError
              ? "text-rose-800 dark:text-rose-200"
              : "text-amber-800 dark:text-amber-200",
          )}
        >
          {issue.message}
        </p>
        {line ? (
          <button
            type="button"
            onClick={() => onFix(line)}
            className="si-micro font-mono text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Line {line} — fix in editor
          </button>
        ) : null}
        {issue.location?.snippet ? (
          <pre className="si-micro overflow-x-auto rounded bg-neutral-900/90 px-2 py-1 font-mono text-[10px] text-neutral-200">
            {issue.location.snippet}
          </pre>
        ) : null}
      </div>
    </li>
  );
}
