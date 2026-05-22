/**
 * `null-safety` — flags an unguarded dereference of a value returned by an ISC
 * lookup that can miss.
 *
 * The classic connector-rule NPE: `Identity id = context.getObjectByName(...)`
 * then `id.getAttribute(...)` with no `if (id != null)` between them. ISC
 * lookups return null on a miss, so the deref throws and aborts aggregation
 * for that account.
 *
 * Scope matters here. `analysis.nullDerefs` records *every* value assigned from
 * a call and dereffed without a guard — but most calls in real BeanShell rules
 * are JDK factories/builders (`Instant.now()`, `now.plus(...)`,
 * `MessageDigest.getInstance(...)`, `x.getBytes(...)`) that never return null.
 * Flagging those is noise that trains people to ignore the banner. So we fire
 * only when the value came from an ISC lookup — calls on `context`, plus the
 * `getObject*` family on any receiver — which is where the null-on-miss
 * contract actually lives. The nullable-call policy is intentionally here in
 * the detector, not baked into the general analysis.
 */
import type { Issue } from "../../types.ts";
import type { SourceDetector } from "../types.ts";
import { sourceIssue } from "../util.ts";

const DETECTOR_ID = "null-safety";

/** Does the originating call follow the ISC null-on-miss lookup contract? */
function isIscLookup(originCall: string): boolean {
  if (originCall === "context" || originCall.startsWith("context.")) return true;
  const method = originCall.includes(".") ? originCall.slice(originCall.lastIndexOf(".") + 1) : originCall;
  return /^get(Object|Application|Identity)/.test(method);
}

export const nullSafety: SourceDetector = {
  id: DETECTOR_ID,
  severity: "warning",
  description:
    "Dereferencing the result of an ISC lookup (context.getObjectByName, …) without a null check. ISC lookups return null on a miss, so the unguarded access throws.",
  check: ({ ruleId, analysis }): Issue[] =>
    analysis.nullDerefs
      .filter((d) => isIscLookup(d.originCall))
      .map((d) =>
        sourceIssue({
          ruleId,
          detectorId: DETECTOR_ID,
          severity: "warning",
          message: `'${d.variable}' is assigned from an ISC lookup (line ${d.originLine}) that returns null on a miss, and dereferenced here without a null check — guard it with 'if (${d.variable} != null)'.`,
          analysis,
          line: d.line,
        }),
      ),
};
