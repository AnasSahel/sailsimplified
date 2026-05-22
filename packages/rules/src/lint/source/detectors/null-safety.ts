/**
 * `null-safety` — flags an unguarded dereference of a value that came from a
 * method call.
 *
 * The classic connector-rule NPE: `Identity id = context.getObjectByName(...)`
 * then `id.getAttribute(...)` with no `if (id != null)` between them. ISC
 * lookups return null on a miss, so the deref throws and aborts aggregation
 * for that account. `analysis.nullDerefs` already encodes the heuristic
 * (assigned-from-a-call, no guard seen before the use) — this detector turns
 * each into a located warning.
 */
import type { Issue } from "../../types.ts";
import type { SourceDetector } from "../types.ts";
import { sourceIssue } from "../util.ts";

const DETECTOR_ID = "null-safety";

export const nullSafety: SourceDetector = {
  id: DETECTOR_ID,
  severity: "warning",
  description:
    "Dereferencing a value returned by a call without a null check. ISC lookups return null on a miss, so the unguarded access throws.",
  check: ({ ruleId, analysis }): Issue[] =>
    analysis.nullDerefs.map((d) =>
      sourceIssue({
        ruleId,
        detectorId: DETECTOR_ID,
        severity: "warning",
        message: `'${d.variable}' is assigned from a call (line ${d.originLine}) and dereferenced here without a null check — guard it with 'if (${d.variable} != null)'.`,
        analysis,
        line: d.line,
      }),
    ),
};
