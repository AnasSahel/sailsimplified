/**
 * Tests for the `broken-reference` rule. Inline tsx-runnable, same
 * convention as other test files in this package:
 *
 *   npx tsx packages/transforms/src/lint/rules/broken-reference.test.ts
 */

import { brokenReference } from "./broken-reference.ts";
import type { LintContext, LintTransform, TransformGraph } from "../types.ts";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
  console.log(`PASS ${label}`);
}

function makeCtx(transforms: LintTransform[], extraNames: string[] = []): LintContext {
  const graph: TransformGraph = new Set([
    ...transforms.map((t) => t.name),
    ...extraNames,
  ]);
  return {
    transforms,
    graph,
    usages: new Map(),
    sources: [],
    now: new Date("2026-05-14T00:00:00Z"),
  };
}

// ── 1. positive: top-level reference points at a missing target ─────────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "reference",
    attributes: { id: "missing-target" },
  };
  const ctx = makeCtx([t]);
  const issues = brokenReference.check(t, ctx);
  assertEqual(issues.length, 1, "top-level missing: one issue");
  assertEqual(issues[0]!.ruleId, "broken-reference", "top-level missing: ruleId");
  assertEqual(issues[0]!.severity, "error", "top-level missing: severity error");
  assertEqual(
    issues[0]!.transformId,
    "test-transform-a",
    "top-level missing: transformId",
  );
  assertEqual(
    issues[0]!.message,
    'Reference to "missing-target" which does not exist.',
    "top-level missing: message",
  );
  assertEqual(
    issues[0]!.pointer,
    "/attributes/id",
    "top-level missing: pointer",
  );
}

// ── 2. negative: top-level reference whose target exists → no issue ─────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "reference",
    attributes: { id: "target-transform" },
  };
  const ctx = makeCtx([t], ["target-transform"]);
  const issues = brokenReference.check(t, ctx);
  assertEqual(issues.length, 0, "top-level present: no issue");
}

// ── 3. positive: deeply nested reference (firstValid.values[2]) broken ──
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "firstValid",
    attributes: {
      values: [
        { type: "static", attributes: { value: "fixed" } },
        { type: "accountAttribute", attributes: { sourceName: "X", attributeName: "y" } },
        {
          type: "reference",
          attributes: { id: "deeply-broken-ref" },
        },
      ],
    },
  };
  const ctx = makeCtx([t]);
  const issues = brokenReference.check(t, ctx);
  assertEqual(issues.length, 1, "nested missing: one issue");
  assertEqual(
    issues[0]!.message,
    'Reference to "deeply-broken-ref" which does not exist.',
    "nested missing: message",
  );
  assertEqual(
    issues[0]!.pointer,
    "/attributes/values/2/attributes/id",
    "nested missing: pointer encodes path through firstValid.values[2]",
  );
}

// ── 4. negative: deeply nested reference whose target exists → no issue ─
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "firstValid",
    attributes: {
      values: [
        {
          type: "reference",
          attributes: { id: "target-transform" },
        },
      ],
    },
  };
  const ctx = makeCtx([t], ["target-transform"]);
  const issues = brokenReference.check(t, ctx);
  assertEqual(issues.length, 0, "nested present: no issue");
}

// ── 5. negative: transform with no `reference` step at all → no issue ───
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
  const issues = brokenReference.check(t, ctx);
  assertEqual(issues.length, 0, "no-reference: no issue");
}

// ── 6. edge: reference with no `attributes.id` (malformed) → no crash ───
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "firstValid",
    attributes: {
      values: [{ type: "reference", attributes: {} }],
    },
  };
  const ctx = makeCtx([t]);
  const issues = brokenReference.check(t, ctx);
  // No id to validate against — we don't synthesise an error from a
  // malformed step (a future "malformed-step" rule would handle that).
  assertEqual(issues.length, 0, "malformed reference: no false positive");
}

// ── 7. multiple broken references in the same transform → one issue per ─
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "firstValid",
    attributes: {
      values: [
        { type: "reference", attributes: { id: "missing-1" } },
        { type: "reference", attributes: { id: "missing-2" } },
        { type: "reference", attributes: { id: "target-transform" } },
      ],
    },
  };
  const ctx = makeCtx([t], ["target-transform"]);
  const issues = brokenReference.check(t, ctx);
  assertEqual(issues.length, 2, "multi-missing: two issues");
  assertEqual(
    issues.map((i) => i.message).sort(),
    [
      'Reference to "missing-1" which does not exist.',
      'Reference to "missing-2" which does not exist.',
    ],
    "multi-missing: both names reported",
  );
}

console.log("\nAll broken-reference rule tests passed.");
