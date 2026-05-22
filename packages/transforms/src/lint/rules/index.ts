/**
 * Rule registry. Adding a new rule = create one file in this directory
 * and append it to the `rules` array below. No DSL, no auto-discovery —
 * the explicit list keeps the build statically analysable and the
 * rule order deterministic across runs.
 */
import type { Rule } from "../types.ts";
import { brokenReference } from "./broken-reference.ts";
import { lookupMissingDefault } from "./lookup-missing-default.ts";
import { orphanCustomStale } from "./orphan-custom-stale.ts";

export const rules: ReadonlyArray<Rule> = [
  brokenReference,
  lookupMissingDefault,
  orphanCustomStale,
];

export { brokenReference, lookupMissingDefault, orphanCustomStale };
