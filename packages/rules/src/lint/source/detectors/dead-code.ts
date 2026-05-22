/**
 * `dead-code` — two hygiene smells, both warnings:
 *
 *  1. **Unreachable statement** after a `return` / `throw` / `break` /
 *     `continue` in the same block. Computed from the terminator list + brace
 *     depth: a code token at the terminator's depth that isn't the block's
 *     closing `}` and isn't a branch continuation (`else` / `case` / `default`
 *     / `catch` / `finally`) is unreachable.
 *  2. **Unused local** — a declared local with zero post-declaration
 *     references (`analysis.locals`).
 *
 * Heuristic: scoping is approximated by name, so a shadowed local could read
 * as used. Warning severity keeps a rare false positive cheap.
 */
import type { Issue } from "../../types.ts";
import type { SourceAnalysis } from "../../../analysis/index.ts";
import type { SourceDetector } from "../types.ts";
import { sourceIssue } from "../util.ts";

const DETECTOR_ID = "dead-code";

/** Keywords that legitimately follow a terminator at the same depth (branch/label continuations). */
const CONTINUATIONS = new Set(["else", "case", "default", "catch", "finally"]);

function findUnreachable(ruleId: string, analysis: SourceAnalysis): Issue[] {
  const code = analysis.tokens.filter((t) => t.kind !== "comment");
  const issues: Issue[] = [];
  const seenLines = new Set<number>();

  for (const term of analysis.controlFlow.terminators) {
    const D = term.depth;
    const termIdx = code.findIndex((t) => t.start === term.start);
    if (termIdx < 0) continue;
    // Advance past the terminator statement's `;`.
    let i = termIdx + 1;
    while (i < code.length && !(code[i].kind === "punct" && code[i].value === ";" && code[i].depth >= D)) {
      i++;
    }
    i++; // token after the `;`
    if (i >= code.length) continue;
    const next = code[i];
    if (next.depth < D) continue; // block ended — reachable boundary
    if (next.kind === "punct" && next.value === "}") continue;
    if (next.kind === "keyword" && CONTINUATIONS.has(next.value)) continue;
    if (seenLines.has(next.line)) continue;
    seenLines.add(next.line);
    issues.push(
      sourceIssue({
        ruleId,
        detectorId: DETECTOR_ID,
        severity: "warning",
        message: `Unreachable code — this statement can never run, the block already exited at line ${term.line}.`,
        analysis,
        line: next.line,
      }),
    );
  }
  return issues;
}

export const deadCode: SourceDetector = {
  id: DETECTOR_ID,
  severity: "warning",
  description:
    "Unreachable statements after a return/throw/break/continue, and declared locals that are never read.",
  check: ({ ruleId, analysis }): Issue[] => {
    const issues: Issue[] = findUnreachable(ruleId, analysis);
    for (const local of analysis.locals) {
      if (local.references > 0) continue;
      issues.push(
        sourceIssue({
          ruleId,
          detectorId: DETECTOR_ID,
          severity: "warning",
          message: `Local '${local.name}' is declared but never read — remove it.`,
          analysis,
          line: local.line,
        }),
      );
    }
    return issues;
  },
};
