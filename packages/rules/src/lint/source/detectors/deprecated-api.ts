/**
 * `deprecated-api` — flags calls to ISC APIs that are unavailable or
 * discouraged inside connector rules.
 *
 * Connector rules run in the connector's restricted runtime, not the full
 * IdentityIQ engine: the `SailPointContext` persistence/search surface that
 * legacy IIQ rules lean on is either absent or unsupported in ISC, and a few
 * JVM calls (`Thread.sleep`, `System.exit`) actively harm the connector. This
 * is a **curated** list — conservative on purpose, since a false "this API is
 * gone" is more damaging than a missed one. Matched off `analysis.apiCalls`.
 */
import type { Issue } from "../../types.ts";
import type { SourceDetector } from "../types.ts";
import { sourceIssue } from "../util.ts";

const DETECTOR_ID = "deprecated-api";

type DeprecatedApi = {
  /** Match against `ApiCall.qualified` (receiver.method), or `method` alone when `byMethod`. */
  match: string;
  byMethod?: boolean;
  severity: "error" | "warning";
  message: string;
};

/**
 * Curated list. `error` = unsupported in the connector runtime (will fail or
 * is silently dropped); `warning` = works but discouraged / has a better idiom.
 */
const DEPRECATED: ReadonlyArray<DeprecatedApi> = [
  // SailPointContext persistence — not available in the connector runtime.
  { match: "context.saveObject", severity: "error", message: "context.saveObject is not supported in connector rules — the rule runs outside the IdentityIQ persistence engine." },
  { match: "context.commitTransaction", severity: "error", message: "context.commitTransaction is not supported in connector rules." },
  { match: "context.importObject", severity: "error", message: "context.importObject is not supported in connector rules." },
  { match: "context.decrypt", severity: "error", message: "context.decrypt is not available in connector rules — pass secrets via connector attributes instead." },
  // SailPointContext search — unreliable / unsupported; rely on the passed-in objects.
  { match: "context.getObjectByName", severity: "warning", message: "context.getObjectByName relies on the IIQ object model, which connector rules cannot assume — use the data passed into the rule." },
  { match: "context.getObject", severity: "warning", message: "context.getObject relies on the IIQ object model — use the data passed into the rule." },
  { match: "context.getObjects", severity: "warning", message: "context.getObjects relies on the IIQ object model — use the data passed into the rule." },
  { match: "context.search", severity: "warning", message: "context.search is not supported in the connector runtime — avoid querying from inside a connector rule." },
  { match: "context.countObjects", severity: "warning", message: "context.countObjects is not supported in the connector runtime." },
  // JVM calls that harm the connector.
  { match: "Thread.sleep", severity: "error", message: "Thread.sleep blocks the connector thread — never sleep inside a connector rule." },
  { match: "System.exit", severity: "error", message: "System.exit terminates the connector process — never call it from a rule." },
  { match: "System.out.println", severity: "warning", message: "System.out.println output is not captured — use the provided log/logger instead." },
  { match: "System.err.println", severity: "warning", message: "System.err.println output is not captured — use the provided log/logger instead." },
  { match: "printStackTrace", byMethod: true, severity: "warning", message: "printStackTrace output is not captured — log the exception via the provided logger instead." },
];

export const deprecatedApi: SourceDetector = {
  id: DETECTOR_ID,
  severity: "warning",
  description:
    "Calls to ISC APIs that are unavailable or discouraged inside connector rules (SailPointContext persistence/search, blocking JVM calls).",
  check: ({ ruleId, analysis }): Issue[] => {
    const issues: Issue[] = [];
    for (const call of analysis.apiCalls) {
      const hit = DEPRECATED.find((d) =>
        d.byMethod ? call.method === d.match : call.qualified === d.match,
      );
      if (!hit) continue;
      issues.push(
        sourceIssue({
          ruleId,
          detectorId: DETECTOR_ID,
          severity: hit.severity,
          message: hit.message,
          analysis,
          line: call.line,
        }),
      );
    }
    return issues;
  },
};
