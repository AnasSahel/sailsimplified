/**
 * Public surface of the source-analysis sub-module. Re-exported from the
 * package barrel so consumers (the source-lint detectors, the drawer's live
 * scan, the snapshot job, and epic B) import via `@simplified-identity/rules`.
 */
export * from "./lexer.ts";
export * from "./types.ts";
export * from "./analyze.ts";
