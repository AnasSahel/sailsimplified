/**
 * `hardcoded-secrets` — flags string literals classified as a secret or an
 * ISC resource id by `analyzeSource`.
 *
 *  - **secret** (`error`): a literal assigned to / passed into a
 *    secret-named target (password, token, apiKey, …). A credential baked
 *    into rule source leaks into every export, diff, and audit log — it must
 *    come from a connector attribute, never the script.
 *  - **id** (`warning`): a hardcoded ISC id (UUID / 32-char cc id) pins the
 *    rule to one tenant's object and silently breaks on promotion to another
 *    environment.
 */
import type { Issue } from "../../types.ts";
import type { SourceDetector } from "../types.ts";
import { sourceIssue } from "../util.ts";

const DETECTOR_ID = "hardcoded-secrets";

export const hardcodedSecrets: SourceDetector = {
  id: DETECTOR_ID,
  severity: "error",
  description:
    "String literals that look like a secret (credential baked into source) or a hardcoded ISC id (breaks on promotion to another tenant).",
  check: ({ ruleId, analysis }): Issue[] => {
    const issues: Issue[] = [];
    for (const lit of analysis.literals) {
      if (lit.class === "secret") {
        issues.push(
          sourceIssue({
            ruleId,
            detectorId: DETECTOR_ID,
            severity: "error",
            message:
              "Hardcoded secret in source — a credential here leaks into every export and audit log. Pass it via a connector attribute instead.",
            analysis,
            line: lit.line,
          }),
        );
      } else if (lit.class === "id") {
        issues.push(
          sourceIssue({
            ruleId,
            detectorId: DETECTOR_ID,
            severity: "warning",
            message:
              "Hardcoded ISC id pins this rule to one tenant's object — it breaks when promoted to another environment. Resolve the object by name or attribute instead.",
            analysis,
            line: lit.line,
          }),
        );
      }
    }
    return issues;
  },
};
