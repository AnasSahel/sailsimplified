/**
 * Public surface of the connector-rules lint sub-module. Re-exported from
 * the package barrel so consumers (the `apps/web` lint shim, future CLI)
 * import everything via `@simplified-identity/rules`.
 */
export * from "./types.ts";
export * from "./engine.ts";
export { detectors, unattachedRule } from "./rules/index.ts";
