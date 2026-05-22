/**
 * Cache-behaviour test for the lint runner factory. Mirrors the
 * inline-tsx convention used in `packages/transforms/src/lint/lint.test.ts`
 * — run with:
 *
 *   npx tsx apps/web/lib/sailpoint/lint-runner.test.ts
 *
 * Exits 0 on success, throws (non-zero exit) on first failure.
 *
 * Scope: covers the cache TTL, force-bypass, and per-scope keying. The
 * full `buildLintContext` path (real `sailpointFetch`, real ISC payloads)
 * is out of scope here — that's the smoke test on the page.
 *
 * We import from `lint-runner-core.ts` (the pure factory) on purpose:
 * `lint-runner.ts` itself imports `server-only` and `next/headers` via
 * the auth/DB-backed `sailpointFetch` shim, neither of which is
 * available in a plain `node`/`tsx` test process.
 */

import { createLintRunner } from "./lint-runner-core";
import type { LintContext } from "@simplified-identity/transforms";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
  console.log(`PASS ${label}`);
}

function emptyCtx(now: Date = new Date("2026-05-14T00:00:00Z")): LintContext {
  return {
    transforms: [],
    graph: new Set(),
    usages: new Map(),
    sources: [],
    now,
  };
}

async function main() {

// ── 1. cache hit within TTL → builder called once ───────────────────────
{
  let calls = 0;
  const runner = createLintRunner({
    buildContext: async () => {
      calls += 1;
      return emptyCtx();
    },
    ttlMs: 5 * 60 * 1000,
    now: () => 1000, // fixed clock — no time advances between calls
  });

  await runner.getOrCompute("scope-a");
  await runner.getOrCompute("scope-a");
  await runner.getOrCompute("scope-a");

  assertEqual(calls, 1, "TTL hit: builder invoked exactly once across 3 calls");
}

// ── 2. cache miss after TTL → builder re-invoked ────────────────────────
{
  let calls = 0;
  let clock = 1000;
  const runner = createLintRunner({
    buildContext: async () => {
      calls += 1;
      return emptyCtx();
    },
    ttlMs: 1000, // 1s TTL for test brevity
    now: () => clock,
  });

  await runner.getOrCompute("scope-a");
  clock += 500; // still within TTL
  await runner.getOrCompute("scope-a");
  clock += 1000; // past TTL (1500ms elapsed since first call)
  await runner.getOrCompute("scope-a");

  assertEqual(calls, 2, "TTL miss: builder invoked again after expiry");
}

// ── 3. force=true bypasses a fresh cached entry ─────────────────────────
{
  let calls = 0;
  const runner = createLintRunner({
    buildContext: async () => {
      calls += 1;
      return emptyCtx();
    },
    ttlMs: 5 * 60 * 1000,
    now: () => 1000,
  });

  await runner.getOrCompute("scope-a");
  await runner.getOrCompute("scope-a", { force: true });
  await runner.getOrCompute("scope-a", { force: true });

  assertEqual(calls, 3, "force: bypasses cache every time");
}

// ── 4. distinct scope keys do not share cache ───────────────────────────
{
  let calls = 0;
  const runner = createLintRunner({
    buildContext: async () => {
      calls += 1;
      return emptyCtx();
    },
    ttlMs: 5 * 60 * 1000,
    now: () => 1000,
  });

  await runner.getOrCompute("scope-a");
  await runner.getOrCompute("scope-b");
  await runner.getOrCompute("scope-a"); // hit
  await runner.getOrCompute("scope-b"); // hit

  assertEqual(calls, 2, "scope: each key computes once, then caches");
}

// ── 5. builder returning null → caller gets null, no cache write ────────
{
  let calls = 0;
  const runner = createLintRunner({
    buildContext: async () => {
      calls += 1;
      return null;
    },
    ttlMs: 5 * 60 * 1000,
    now: () => 1000,
  });

  const first = await runner.getOrCompute("scope-a");
  const second = await runner.getOrCompute("scope-a");

  assertEqual(first, null, "null: first call returns null");
  assertEqual(second, null, "null: second call returns null (no cache hit)");
  assertEqual(calls, 2, "null: builder re-invoked because nothing was cached");
}

}

main()
  .then(() => {
    console.log("\nAll lint-runner tests passed.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
