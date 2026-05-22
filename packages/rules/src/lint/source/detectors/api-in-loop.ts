/**
 * `api-in-loop` — flags a `context.*` call whose call site sits inside a loop
 * body.
 *
 * A lookup or remote call per iteration is the dominant connector-rule perf
 * trap: an aggregation over thousands of accounts that calls
 * `context.getObjectByName(...)` once per member turns one aggregation into N
 * round-trips. We deliberately scope this to the ISC `context` surface — local
 * getters, list access (`names.get(k)`), and logging in a loop are cheap and
 * flagging them would drown the real trap in noise. Containment is a pure
 * offset test against the loop body ranges `analyzeSource` computed (nesting
 * handled — reported against the innermost enclosing loop).
 */
import type { Issue } from "../../types.ts";
import type { Loop } from "../../../analysis/index.ts";
import type { SourceDetector } from "../types.ts";
import { sourceIssue } from "../util.ts";

const DETECTOR_ID = "api-in-loop";

/** The innermost loop whose body contains `offset`, if any. */
function innermostLoopAt(loops: ReadonlyArray<Loop>, offset: number): Loop | undefined {
  let best: Loop | undefined;
  for (const loop of loops) {
    if (offset >= loop.bodyStart && offset < loop.bodyEnd) {
      if (!best || loop.bodyStart > best.bodyStart) best = loop;
    }
  }
  return best;
}

export const apiInLoop: SourceDetector = {
  id: DETECTOR_ID,
  severity: "warning",
  description:
    "An API call inside a loop body — one remote/lookup call per iteration. Hoist it out of the loop or batch it.",
  check: ({ ruleId, analysis }): Issue[] => {
    if (analysis.loops.length === 0) return [];
    const issues: Issue[] = [];
    for (const call of analysis.apiCalls) {
      if (call.isConstructor) continue; // a `new X()` per iteration is cheap, not a round-trip
      // Scope to the ISC context surface — that's where the per-iteration round-trip lives.
      if (call.receiver !== "context" && !call.receiver.startsWith("context.")) continue;
      const loop = innermostLoopAt(analysis.loops, call.start);
      if (!loop) continue;
      issues.push(
        sourceIssue({
          ruleId,
          detectorId: DETECTOR_ID,
          severity: "warning",
          message: `'${call.qualified}(...)' runs on every iteration of the loop at line ${loop.line} — hoist it out or batch the lookup.`,
          analysis,
          line: call.line,
        }),
      );
    }
    return issues;
  },
};
