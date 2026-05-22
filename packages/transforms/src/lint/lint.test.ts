/**
 * Engine smoke tests. Mirrors the inline-tsx convention used elsewhere in
 * this package (cf. `auto-samples.test.ts`) — run with:
 *
 *   npx tsx packages/transforms/src/lint/lint.test.ts
 *
 * Exits 0 on success, throws (non-zero exit) on first failure. Stays
 * minimal on purpose; if assertions multiply meaningfully, lift to a
 * real runner (vitest) in a follow-up PR.
 */

import { runLint } from "./engine.ts";
import type {
  Issue,
  LintContext,
  LintTransform,
  Rule,
  TransformGraph,
  TransformUsagesIndex,
} from "./types.ts";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
  console.log(`PASS ${label}`);
}

function makeCtx(overrides: Partial<LintContext> = {}): LintContext {
  const transforms: LintTransform[] = overrides.transforms
    ? [...overrides.transforms]
    : [];
  const graph: TransformGraph =
    overrides.graph ?? new Set(transforms.map((t) => t.name));
  const usages: TransformUsagesIndex = overrides.usages ?? new Map();
  return {
    transforms,
    graph,
    usages,
    sources: overrides.sources ?? [],
    now: overrides.now ?? new Date("2026-05-14T00:00:00Z"),
  };
}

const noopRule: Rule = {
  id: "noop",
  severity: "warning",
  description: "Never emits.",
  check: () => [],
};

function ruleEmittingFor(
  ruleId: string,
  severity: "error" | "warning",
  transformId: string,
): Rule {
  return {
    id: ruleId,
    severity,
    description: `Always emits a ${severity} for ${transformId}.`,
    check: (transform): Issue[] => {
      if (transform.id !== transformId) return [];
      return [
        {
          ruleId,
          severity,
          transformId: transform.id,
          message: `synthetic ${severity}`,
        },
      ];
    },
  };
}

// ── 1. empty transforms list → empty result ─────────────────────────────
{
  const ctx = makeCtx();
  const result = runLint(ctx, [noopRule]);
  assertEqual(result.errors.length, 0, "empty: no errors");
  assertEqual(result.warnings.length, 0, "empty: no warnings");
  assertEqual(result.byTransformId.size, 0, "empty: byTransformId is empty");
}

// ── 2. registry honoured: when no rule matches, no issues ───────────────
{
  const ctx = makeCtx({
    transforms: [
      { id: "test-transform-a", name: "test-a", type: "static", attributes: {} },
    ],
  });
  const result = runLint(ctx, [noopRule]);
  assertEqual(result.errors.length, 0, "no-match: no errors");
  assertEqual(result.warnings.length, 0, "no-match: no warnings");
}

// ── 3. single rule that produces an issue → bucketed correctly ──────────
{
  const ctx = makeCtx({
    transforms: [
      { id: "test-transform-a", name: "test-a", type: "static", attributes: {} },
    ],
  });
  const result = runLint(ctx, [
    ruleEmittingFor("synthetic-error", "error", "test-transform-a"),
  ]);
  assertEqual(result.errors.length, 1, "single-error: one error");
  assertEqual(result.warnings.length, 0, "single-error: no warnings");
  assertEqual(
    result.byTransformId.get("test-transform-a")?.length,
    1,
    "single-error: indexed under transformId",
  );
  assertEqual(
    result.errors[0]!.ruleId,
    "synthetic-error",
    "single-error: ruleId preserved",
  );
}

// ── 4. multiple rules across multiple transforms → aggregated ───────────
{
  const ctx = makeCtx({
    transforms: [
      { id: "test-transform-a", name: "test-a", type: "static", attributes: {} },
      { id: "test-transform-b", name: "test-b", type: "static", attributes: {} },
    ],
  });
  const result = runLint(ctx, [
    ruleEmittingFor("err-1", "error", "test-transform-a"),
    ruleEmittingFor("warn-1", "warning", "test-transform-a"),
    ruleEmittingFor("warn-2", "warning", "test-transform-b"),
    noopRule,
  ]);
  assertEqual(result.errors.length, 1, "multi: one error total");
  assertEqual(result.warnings.length, 2, "multi: two warnings total");
  assertEqual(
    result.byTransformId.get("test-transform-a")?.length,
    2,
    "multi: transform-a has 2 issues (1 err + 1 warn)",
  );
  assertEqual(
    result.byTransformId.get("test-transform-b")?.length,
    1,
    "multi: transform-b has 1 issue",
  );
  assertEqual(
    result.byTransformId.size,
    2,
    "multi: only transforms with issues are keyed",
  );
}

// ── 5. byTransformId grouping: same transform hit by 3 distinct rules ───
{
  const ctx = makeCtx({
    transforms: [
      { id: "target-transform", name: "target", type: "static", attributes: {} },
    ],
  });
  const result = runLint(ctx, [
    ruleEmittingFor("a", "error", "target-transform"),
    ruleEmittingFor("b", "warning", "target-transform"),
    ruleEmittingFor("c", "warning", "target-transform"),
  ]);
  const grouped = result.byTransformId.get("target-transform");
  assertEqual(grouped?.length, 3, "group: 3 issues bucketed under one transformId");
  assertEqual(
    grouped?.map((i) => i.ruleId).sort(),
    ["a", "b", "c"],
    "group: every rule contributed",
  );
}

// ── 6. default registry hook: omitting rulesOverride uses real registry ─
{
  // Use a transform with a broken reference so the real registry's
  // broken-reference rule fires — proves the engine wires the default
  // registry when no override is passed.
  const ctx = makeCtx({
    transforms: [
      {
        id: "test-transform-a",
        name: "test-a",
        type: "reference",
        attributes: {
          id: "does-not-exist",
        },
      },
    ],
    graph: new Set(["test-a"]),
  });
  const result = runLint(ctx);
  assertEqual(
    result.errors.length >= 1,
    true,
    "default-registry: broken-reference fires without override",
  );
}

// ── 7. registry picks up all 3 v1 rules; counts errors+warnings split ───
{
  // Triple-trigger: one transform that should hit `broken-reference`
  // (error) + `lookup-missing-default` (warning) at once + a separate
  // custom orphan that's stale + zero-usages → `orphan-custom-stale`
  // (warning). Net: 1 error + 2 warnings, all 3 rules contributing.
  const stale = new Date("2025-08-01T00:00:00Z").toISOString(); // > 180 days before NOW
  const ctx = makeCtx({
    transforms: [
      {
        id: "test-transform-a",
        name: "test-a",
        type: "lookup",
        attributes: {
          input: { type: "reference", attributes: { id: "missing-target" } },
          table: { US: "United States" }, // no default
        },
        internal: false,
        modified: stale,
      },
      {
        id: "test-transform-b",
        name: "test-b",
        type: "static",
        attributes: { value: "fixed" },
        internal: false,
        modified: stale,
      },
    ],
    graph: new Set(["test-a", "test-b"]),
    now: new Date("2026-05-14T00:00:00Z"),
  });
  const result = runLint(ctx);
  // 1 error from broken-reference (test-a → missing-target)
  assertEqual(result.errors.length, 1, "all-rules: 1 error (broken-reference)");
  assertEqual(
    result.errors[0]!.ruleId,
    "broken-reference",
    "all-rules: error is broken-reference",
  );
  // 1 warning from lookup-missing-default + 2 from orphan-custom-stale
  // (both transforms are custom, zero-usage, stale).
  assertEqual(result.warnings.length, 3, "all-rules: 3 warnings (lookup + 2 orphans)");
  const warningIds = new Set(result.warnings.map((w) => w.ruleId));
  assertEqual(
    warningIds.has("lookup-missing-default"),
    true,
    "all-rules: lookup-missing-default present",
  );
  assertEqual(
    warningIds.has("orphan-custom-stale"),
    true,
    "all-rules: orphan-custom-stale present",
  );
}

console.log("\nAll engine tests passed.");
