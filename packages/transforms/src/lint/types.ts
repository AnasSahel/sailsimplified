/**
 * Public types for the transforms lint engine.
 *
 * The engine is intentionally pure: it consumes a `LintContext` already
 * built by the caller (transforms + graph + usages + sources, all already
 * fetched for the list page) and emits typed `Issue[]`. No I/O, no async.
 *
 * Architecture decisions for the lint surface live in
 * `vault/Projects/Simplified Identity/2026-05-14-transforms-lint-architecture.md`.
 *
 * A `Rule` is a pure function — adding a new detection means writing one
 * file under `rules/` and registering it in `rules/index.ts`. No DSL,
 * no inheritance, no framework. See ADR §Q2.
 */
import type { EvaluableTransform } from "../types";
import type { UsageEntry } from "../usages";

/**
 * Severity vocabulary mirrors IDE/linter convention (TS, ESLint, GitHub
 * Actions): `error` blocks (the transform is broken at evaluation time),
 * `warning` informs (anti-pattern that works but smells).
 */
export type Severity = "error" | "warning";

/**
 * One finding emitted by a rule against a single transform. The shape is
 * stable across every rule so the UI can render a uniform list and the
 * API can serialise it without per-rule branching.
 *
 * `pointer` is an optional JSON-pointer-ish path into the offending
 * step's location inside the transform (e.g. `/attributes/values/2`).
 * Rules should set it whenever they can localise the issue precisely.
 */
export type Issue = {
  ruleId: string;
  severity: Severity;
  transformId: string;
  message: string;
  pointer?: string;
};

/**
 * The transform shape consumed by lint rules. Extends `EvaluableTransform`
 * with the two list-payload fields rules need but the evaluator doesn't:
 *
 *   - `internal` — distinguishes built-in (tenant-shipped) transforms
 *     from custom (user-authored) ones. The `orphan-custom-stale` rule
 *     skips built-ins entirely (cf. PR #3 of #310).
 *   - `modified` — ISO timestamp of the last edit, returned by
 *     `/v2025/transforms`. The `orphan-custom-stale` rule treats absent
 *     or older-than-180-days as stale.
 *
 * Both fields are optional — older list payloads (or future fetch paths)
 * may omit them, and rules that depend on them must degrade gracefully.
 */
export type LintTransform = EvaluableTransform & {
  internal?: boolean;
  modified?: string;
};

/**
 * Tenant-wide transform graph used by reference-resolution rules.
 *
 * SailPoint references a transform by **name** (not by id) — see the
 * comment at the top of `usages.ts`. So the lookup surface a rule needs
 * is "given the name found in `attributes.id` of a `reference` step, does
 * a transform with that name exist?". A `Set<string>` of names answers
 * that in O(1) without coupling rules to a heavier graph type.
 *
 * The shape is intentionally minimal — future rules that need the full
 * record can resolve via `ctx.transforms.find(t => t.name === id)`.
 */
export type TransformGraph = ReadonlySet<string>;

/**
 * Per-transform usage index — `usagesByName.get(transform.name)` returns
 * the list of containers (identity profiles, source policies, other
 * transforms) that reference it. Same shape as the map produced by
 * `computeTransformUsageMap` in `usages.ts`.
 */
export type TransformUsagesIndex = ReadonlyMap<string, ReadonlyArray<UsageEntry>>;

/**
 * Minimal source descriptor — kept generic so rules that don't need
 * source data ignore it, and the rule that will need it (planned
 * `references-disabled-source`, post-v1) can tighten the shape later
 * without breaking other rules.
 */
export type SourceSummary = {
  id: string;
  name: string;
  /** True when the source is disabled / unhealthy (status varies per connector). */
  disabled?: boolean;
};

/**
 * Everything a rule needs to evaluate the tenant. Built once per scan by
 * the `apps/web` shim and threaded through every rule.
 *
 * `now` is injected so rules that depend on time (the planned
 * `orphan-custom-stale`) stay testable without freezing the system clock.
 */
export type LintContext = {
  transforms: ReadonlyArray<LintTransform>;
  graph: TransformGraph;
  usages: TransformUsagesIndex;
  sources: ReadonlyArray<SourceSummary>;
  now: Date;
};

/**
 * The rule contract. `severity` on the rule itself documents the rule's
 * default category and lets the registry filter / surface it without
 * having to invoke `check`. The actual `Issue.severity` is what the rule
 * emits per finding (in v1 it always equals `Rule.severity`, but that
 * may not stay true forever — e.g. a rule could downgrade to warning if
 * a workaround is in place).
 */
export type Rule = {
  id: string;
  severity: Severity;
  /** Plain-English description shown in the rule reference / tooltip. */
  description: string;
  check: (transform: LintTransform, ctx: LintContext) => Issue[];
};

/**
 * Aggregated lint result returned by `runLint`. Both `errors` and
 * `warnings` are flat arrays for header counters. `byTransformId` is the
 * grouping the drawer uses to show "issues for THIS transform" in O(1).
 */
export type LintResult = {
  errors: ReadonlyArray<Issue>;
  warnings: ReadonlyArray<Issue>;
  byTransformId: ReadonlyMap<string, ReadonlyArray<Issue>>;
};
