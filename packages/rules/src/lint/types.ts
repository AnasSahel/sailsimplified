/**
 * Public types for the connector-rules lint engine.
 *
 * Mirrors `packages/transforms/src/lint/types.ts`: the engine is pure —
 * it consumes a `RuleLintContext` already built by the caller (connector
 * rules + the source-attachment usages map + the dangling-reference list,
 * all already computed by the web layer for the list page) and emits typed
 * `Issue[]`. No I/O, no async.
 *
 * A `Detector` is a pure per-rule function — adding a new detection means
 * writing one file under `rules/` and registering it in `rules/index.ts`.
 * No DSL, no inheritance, no framework.
 *
 * Naming note: "rule" is overloaded in this package — the *subject* is a
 * SailPoint connector rule (`RuleRecord`), the *linter* is a `Detector`.
 * We use `Detector` for the lint contract to keep the two apart.
 */
import type { UnresolvedRuleReference, RuleUsageEntry } from "../usages";
import type { RuleRecord } from "../types";

/** `error` blocks (runtime failure), `warning` informs (smell). */
export type Severity = "error" | "warning";

/**
 * Where in a rule's `sourceCode` a finding sits. Present only on source
 * detectors (#361/#362) — structural detectors operate on the rule as a whole
 * and leave it absent. Drives the fix-in-editor deep link (#363).
 */
export type IssueLocation = {
  /** 1-based line in the rule's `sourceCode.script`. */
  line: number;
  /** Trimmed source line for inline display, when available. */
  snippet?: string;
};

/**
 * One finding emitted against a single connector rule. Stable shape across
 * every detector so the UI renders a uniform list. `location` is optional —
 * structural detectors omit it; source detectors set it so a finding can
 * deep-link into the editor at the offending line.
 */
export type Issue = {
  ruleId: string;
  detectorId: string;
  severity: Severity;
  message: string;
  location?: IssueLocation;
};

/**
 * The connector-rule shape lint detectors consume. `RuleRecord` is
 * assignable to it — detectors read `id`, `name`, `type`, and optionally
 * `modified`, and must degrade gracefully when the optional fields are
 * absent.
 */
export type LintableRule = Pick<RuleRecord, "id" | "name" | "type"> & {
  modified?: string;
};

/**
 * Per-rule usage index — `usages.get(rule.id)` returns the sources that
 * attach this rule. Same map produced by `computeRuleUsages`. Keyed by
 * rule **id** (connector rules are attached by id, unlike transforms which
 * are referenced by name).
 */
export type RuleUsagesIndex = ReadonlyMap<string, ReadonlyArray<RuleUsageEntry>>;

/**
 * Everything a detector needs. Built once per scan by the web shim and
 * threaded through every detector. `now` is injected so time-dependent
 * detectors stay testable without freezing the system clock.
 */
export type RuleLintContext = {
  rules: ReadonlyArray<LintableRule>;
  usages: RuleUsagesIndex;
  /** Source rule-slot refs not in the connector-rules inventory, precomputed by the caller. */
  unresolvedReferences: ReadonlyArray<UnresolvedRuleReference>;
  now: Date;
};

/** The per-rule detector contract. */
export type Detector = {
  id: string;
  severity: Severity;
  /** Plain-English description shown in the rule reference / tooltip. */
  description: string;
  check: (rule: LintableRule, ctx: RuleLintContext) => Issue[];
};

/**
 * Aggregated lint result. `errors` / `warnings` are flat arrays for header
 * counters. `byRuleId` is the grouping the drawer uses for "issues for THIS
 * rule" in O(1). `unresolvedReferences` is passed through structured (it has
 * no connector-rule subject to key on — the referenced rule is absent) so
 * the list page can render a tenant-level banner.
 */
export type RuleLintResult = {
  errors: ReadonlyArray<Issue>;
  warnings: ReadonlyArray<Issue>;
  byRuleId: ReadonlyMap<string, ReadonlyArray<Issue>>;
  unresolvedReferences: ReadonlyArray<UnresolvedRuleReference>;
};
