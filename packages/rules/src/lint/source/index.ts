/**
 * Public surface of the source-lint sub-module (analysis-driven detectors).
 * Re-exported from the lint barrel → the package barrel, so the drawer's live
 * scan, the snapshot job, and tests import via `@simplified-identity/rules`.
 */
export * from "./types.ts";
export * from "./engine.ts";
export * from "./util.ts";
export {
  sourceDetectors,
  deprecatedApi,
  nullSafety,
  apiInLoop,
  deadCode,
  hardcodedSecrets,
} from "./detectors/index.ts";
