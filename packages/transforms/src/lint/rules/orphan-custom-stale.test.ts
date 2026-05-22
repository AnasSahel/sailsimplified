/**
 * Tests for the `orphan-custom-stale` rule. Inline tsx-runnable, same
 * convention as the other rule tests:
 *
 *   npx tsx packages/transforms/src/lint/rules/orphan-custom-stale.test.ts
 */

import { orphanCustomStale } from "./orphan-custom-stale.ts";
import type {
  LintContext,
  LintTransform,
  TransformGraph,
  TransformUsagesIndex,
} from "../types.ts";
import type { UsageEntry } from "../../usages.ts";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
  console.log(`PASS ${label}`);
}

const NOW = new Date("2026-05-14T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function makeCtx(
  transforms: LintTransform[],
  usagesByName: Record<string, UsageEntry[]> = {},
): LintContext {
  const graph: TransformGraph = new Set(transforms.map((t) => t.name));
  const usages: TransformUsagesIndex = new Map(Object.entries(usagesByName));
  return {
    transforms,
    graph,
    usages,
    sources: [],
    now: NOW,
  };
}

// ── 1. positive: custom + 0 usages + stale (>180 days) → one issue ───────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "static",
    attributes: { value: "fixed" },
    internal: false,
    modified: isoDaysAgo(200),
  };
  const ctx = makeCtx([t]);
  const issues = orphanCustomStale.check(t, ctx);
  assertEqual(issues.length, 1, "stale custom orphan: one issue");
  assertEqual(issues[0]!.ruleId, "orphan-custom-stale", "stale custom orphan: ruleId");
  assertEqual(issues[0]!.severity, "warning", "stale custom orphan: severity warning");
  assertEqual(
    issues[0]!.transformId,
    "test-transform-a",
    "stale custom orphan: transformId",
  );
}

// ── 2. negative: built-in transforms are never flagged ───────────────────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "static",
    attributes: {},
    internal: true,
    modified: isoDaysAgo(500),
  };
  const ctx = makeCtx([t]);
  const issues = orphanCustomStale.check(t, ctx);
  assertEqual(issues.length, 0, "built-in transform: no issue");
}

// ── 3. negative: custom + usages > 0 → no issue (it's in active use) ─────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "static",
    attributes: {},
    internal: false,
    modified: isoDaysAgo(500),
  };
  const ctx = makeCtx([t], {
    "test-a": [
      {
        kind: "identity-profile",
        containerId: "p-1",
        containerName: "Default",
        attributePath: "displayName",
      },
    ],
  });
  const issues = orphanCustomStale.check(t, ctx);
  assertEqual(issues.length, 0, "custom with usages: no issue");
}

// ── 4. negative: custom + 0 usages + recently modified (<180d) → no issue ─
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "static",
    attributes: {},
    internal: false,
    modified: isoDaysAgo(30),
  };
  const ctx = makeCtx([t]);
  const issues = orphanCustomStale.check(t, ctx);
  assertEqual(issues.length, 0, "recently modified custom orphan: no issue");
}

// ── 5. edge: custom + 0 usages + no `modified` field → flagged as stale ──
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "static",
    attributes: {},
    internal: false,
    // no modified
  };
  const ctx = makeCtx([t]);
  const issues = orphanCustomStale.check(t, ctx);
  assertEqual(issues.length, 1, "missing modified: treated as stale (one issue)");
}

// ── 6. edge: custom + 0 usages + `internal` undefined → still flagged ────
{
  // `internal === true` is the only escape hatch — if the field is
  // missing or false, the transform is treated as custom (matches how
  // `lint-runner` builds the context from the API list payload, where
  // built-ins consistently carry `internal: true`).
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "static",
    attributes: {},
    modified: isoDaysAgo(500),
  };
  const ctx = makeCtx([t]);
  const issues = orphanCustomStale.check(t, ctx);
  assertEqual(issues.length, 1, "internal undefined: treated as custom (flagged)");
}

// ── 7. edge: exactly at the 180-day threshold → flagged (>= boundary) ────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "static",
    attributes: {},
    internal: false,
    modified: isoDaysAgo(180),
  };
  const ctx = makeCtx([t]);
  const issues = orphanCustomStale.check(t, ctx);
  assertEqual(issues.length, 1, "exactly 180 days: flagged");
}

// ── 8. edge: garbage `modified` value → treated as stale (defensive) ─────
{
  const t: LintTransform = {
    id: "test-transform-a",
    name: "test-a",
    type: "static",
    attributes: {},
    internal: false,
    modified: "not-a-date",
  };
  const ctx = makeCtx([t]);
  const issues = orphanCustomStale.check(t, ctx);
  assertEqual(issues.length, 1, "garbage modified: treated as stale (one issue)");
}

console.log("\nAll orphan-custom-stale rule tests passed.");
