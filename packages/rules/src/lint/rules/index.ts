/**
 * Detector registry. Adding a new detector = create one file in this
 * directory and append it to the `detectors` array below. Explicit list,
 * no auto-discovery — keeps the build statically analysable and the
 * detector order deterministic.
 *
 * `missing-reference` (source → absent rule) is **not** a per-rule
 * detector: a dangling reference has no connector-rule subject to key on
 * (the referenced rule is gone). It's computed by
 * `computeDanglingRuleReferences` (in `usages.ts`) and folded into the
 * lint result by the engine — see `engine.ts`.
 */
import type { Detector } from "../types.ts";
import { unattachedRule } from "./unattached-rule.ts";

export const detectors: ReadonlyArray<Detector> = [unattachedRule];

export { unattachedRule };
