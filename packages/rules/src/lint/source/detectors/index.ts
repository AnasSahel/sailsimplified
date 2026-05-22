/**
 * Source-detector registry. Adding a detector = one file in this directory +
 * an entry below. Explicit list, no auto-discovery — deterministic order,
 * statically analysable.
 *
 * Grouped by the epic's two detector sets:
 *   correctness (#361): deprecated-api, null-safety
 *   perf/hygiene (#362): api-in-loop, dead-code, hardcoded-secrets
 */
import type { SourceDetector } from "../types.ts";
import { deprecatedApi } from "./deprecated-api.ts";
import { nullSafety } from "./null-safety.ts";
import { apiInLoop } from "./api-in-loop.ts";
import { deadCode } from "./dead-code.ts";
import { hardcodedSecrets } from "./hardcoded-secrets.ts";

export const sourceDetectors: ReadonlyArray<SourceDetector> = [
  deprecatedApi,
  nullSafety,
  apiInLoop,
  deadCode,
  hardcodedSecrets,
];

export { deprecatedApi, nullSafety, apiInLoop, deadCode, hardcodedSecrets };
