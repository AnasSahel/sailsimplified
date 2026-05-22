/**
 * Tests for the `lookup-missing-default` rule. Inline tsx-runnable, same
 * convention as the other rule tests:
 *
 *   npx tsx packages/transforms/src/lint/rules/lookup-missing-default.test.ts
 */

import { lookupMissingDefault } from "./lookup-missing-default.ts";
import type { LintContext, LintTransform, TransformGraph } from "../types.ts";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
  console.log(`PASS ${label}`);
}

function makeCtx(transforms: LintTransform[]): LintContext {
  const graph: TransformGraph = new Set(transforms.map((t) => t.name));
  return {
    transforms,
    graph,
    usages: new Map(),
    sources: [],
    now: new Date("2026-05-14T00:00:00Z"),
  };
}

// ── 1. positive: top-level lookup without `default` → one issue ──────────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "lookup",
    attributes: {
      input: { type: "accountAttribute", attributes: { sourceName: "X", attributeName: "y" } },
      table: {
        US: "United States",
        FR: "France",
      },
    },
  };
  const ctx = makeCtx([t]);
  const issues = lookupMissingDefault.check(t, ctx);
  assertEqual(issues.length, 1, "top-level missing default: one issue");
  assertEqual(issues[0]!.ruleId, "lookup-missing-default", "top-level missing default: ruleId");
  assertEqual(issues[0]!.severity, "warning", "top-level missing default: severity warning");
  assertEqual(
    issues[0]!.transformId,
    "test-transform-a",
    "top-level missing default: transformId",
  );
  assertEqual(
    issues[0]!.pointer,
    "/attributes/table",
    "top-level missing default: pointer",
  );
}

// ── 2. negative: top-level lookup WITH `default` → no issue ──────────────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "lookup",
    attributes: {
      table: {
        US: "United States",
        default: "Unknown",
      },
    },
  };
  const ctx = makeCtx([t]);
  const issues = lookupMissingDefault.check(t, ctx);
  assertEqual(issues.length, 0, "top-level with default: no issue");
}

// ── 3. negative: lookup with `default: null` is still considered explicit ─
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "lookup",
    attributes: {
      table: {
        US: "United States",
        default: null,
      },
    },
  };
  const ctx = makeCtx([t]);
  const issues = lookupMissingDefault.check(t, ctx);
  // The point of the rule is "make the fallback explicit". `default: null`
  // is an explicit decision — no warning.
  assertEqual(issues.length, 0, "default explicitly set to null: no issue");
}

// ── 4. positive: nested lookup inside firstValid without `default` ───────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "firstValid",
    attributes: {
      values: [
        { type: "static", attributes: { value: "fixed" } },
        {
          type: "lookup",
          attributes: {
            input: { type: "accountAttribute", attributes: { sourceName: "X", attributeName: "y" } },
            table: { A: "alpha", B: "beta" },
          },
        },
      ],
    },
  };
  const ctx = makeCtx([t]);
  const issues = lookupMissingDefault.check(t, ctx);
  assertEqual(issues.length, 1, "nested lookup missing default: one issue");
  assertEqual(
    issues[0]!.pointer,
    "/attributes/values/1/attributes/table",
    "nested lookup missing default: pointer encodes path through firstValid.values[1]",
  );
}

// ── 5. negative: nested lookup WITH `default` → no issue ─────────────────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "firstValid",
    attributes: {
      values: [
        {
          type: "lookup",
          attributes: {
            table: { A: "alpha", default: "fallback" },
          },
        },
      ],
    },
  };
  const ctx = makeCtx([t]);
  const issues = lookupMissingDefault.check(t, ctx);
  assertEqual(issues.length, 0, "nested lookup with default: no issue");
}

// ── 6. negative: transform with no `lookup` step at all → no issue ───────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "concat",
    attributes: {
      values: [
        { type: "static", attributes: { value: "Hello " } },
        { type: "static", attributes: { value: "World" } },
      ],
    },
  };
  const ctx = makeCtx([t]);
  const issues = lookupMissingDefault.check(t, ctx);
  assertEqual(issues.length, 0, "no-lookup: no issue");
}

// ── 7. edge: lookup without `attributes.table` (malformed) → no crash ────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "lookup",
    attributes: {
      input: { type: "static", attributes: { value: "X" } },
      // no table at all
    },
  };
  const ctx = makeCtx([t]);
  const issues = lookupMissingDefault.check(t, ctx);
  // Missing table is a different failure mode (would be a "malformed"
  // rule) — we don't synthesise a missing-default warning when the table
  // is absent altogether. But the rule still reports it as missing the
  // default, since `hasDefaultKey(undefined)` is false. Acceptable: an
  // admin who sees it can fix the malformed step OR declare a default.
  assertEqual(issues.length, 1, "malformed lookup (no table): still flagged");
}

// ── 8. multiple lookups in the same transform → one issue per missing ────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "firstValid",
    attributes: {
      values: [
        {
          type: "lookup",
          attributes: { table: { A: "alpha" } }, // missing default
        },
        {
          type: "lookup",
          attributes: { table: { B: "beta", default: "fallback" } }, // OK
        },
        {
          type: "lookup",
          attributes: { table: { C: "gamma" } }, // missing default
        },
      ],
    },
  };
  const ctx = makeCtx([t]);
  const issues = lookupMissingDefault.check(t, ctx);
  assertEqual(issues.length, 2, "multi-lookup: two issues for two missing defaults");
}

console.log("\nAll lookup-missing-default rule tests passed.");
