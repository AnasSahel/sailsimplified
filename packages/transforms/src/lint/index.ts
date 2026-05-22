/**
 * Public surface of the lint sub-module. Re-exported from the package
 * barrel so consumers (the `apps/web` lint-runner shim, future CLI)
 * import everything via `@simplified-identity/transforms`.
 */
export * from "./types.ts";
export * from "./engine.ts";
export {
  rules,
  brokenReference,
  lookupMissingDefault,
  orphanCustomStale,
} from "./rules/index.ts";
