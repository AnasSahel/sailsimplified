import "server-only";

import {
  computeTransformUsageMap,
  type LintContext,
  type LintTransform,
  type SourceWithPolicies,
  type SourceSummary,
} from "@simplified-identity/transforms";

import { sailpointFetch } from "./client";
import {
  createLintRunner,
  type BuildLintContext,
  type LintCacheEntry,
} from "./lint-runner-core";

/**
 * Server-side composition of the cached lint runner with the real ISC
 * fetcher. The pure factory + cache live in `lint-runner-core.ts` so the
 * unit test can exercise cache behaviour without dragging `server-only`
 * and the better-auth runtime into the test process.
 *
 * Architecture decisions are locked by the ADR
 * `vault/Projects/Simplified Identity/2026-05-14-transforms-lint-architecture.md`
 * §Q1 (sync on demand + 5-min cache scoped per orgId) and §Q3 (engine
 * lives in `packages/transforms/src/lint/`).
 *
 * Cache is process-local on purpose. The app is mono-replica on Dokploy,
 * so the runner's `Map` is shared across every request handler in the
 * same Node process. A future move to multiple replicas will need a
 * shared cache (Redis, libsql) — flagged in the ADR §Gaps & revisites.
 */

export type { LintCacheEntry } from "./lint-runner-core";

// `internal` and `modified` already live on `LintTransform` (added in
// PR #3 of #310 so `orphan-custom-stale` can read them). The list payload
// shape matches `LintTransform` directly — no extra augmentation needed.
type TransformPayload = LintTransform;

type SourceListEntry = { id: string; name: string };

/**
 * Best-effort fetch of an arbitrary list endpoint with a short timeout.
 * Returns `[]` (not `undefined`) on any failure so the caller can keep
 * building a `LintContext` even when an optional input is unavailable —
 * matches the page's own degradation pattern.
 */
async function bestEffortList<T>(
  userId: string,
  path: string,
  timeoutMs: number,
): Promise<T[]> {
  try {
    const result = await sailpointFetch<T[]>(userId, path, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return result.ok ? result.data : [];
  } catch {
    return [];
  }
}

/**
 * Default context builder bound to a specific `userId` (the caller of
 * the runner). Mirrors the fan-out of the Transforms page so the lint
 * sees the same tenant view the user sees.
 *
 * `transforms` is the only required input — without it there is nothing
 * to lint and we return `null` so the route can surface a real error.
 * Identity profiles and sources/policies are best-effort: rules that
 * need them tolerate empty inputs in v1.
 */
export function buildLintContextForUser(userId: string): BuildLintContext {
  return async () => {
    const transformsResult = await sailpointFetch<TransformPayload[]>(
      userId,
      "/v2025/transforms?limit=250",
    );
    if (!transformsResult.ok) return null;
    const transforms = transformsResult.data;

    const [profiles, sources] = await Promise.all([
      bestEffortList<unknown>(userId, "/v2025/identity-profiles", 8000),
      bestEffortList<SourceListEntry>(userId, "/v2025/sources?limit=250", 8000),
    ]);

    const sourcesWithPolicies: SourceWithPolicies[] = await Promise.all(
      sources.map(async (s) => ({
        id: s.id,
        name: s.name,
        policies: await bestEffortList<unknown>(
          userId,
          `/v2025/sources/${encodeURIComponent(s.id)}/provisioning-policies`,
          6000,
        ),
      })),
    );

    const usages = computeTransformUsageMap(
      transforms,
      profiles,
      sourcesWithPolicies,
    );

    const sourceSummaries: SourceSummary[] = sources.map((s) => ({
      id: s.id,
      name: s.name,
    }));

    const ctx: LintContext = {
      transforms,
      // SailPoint references transforms by name, not id — see ADR §Types
      // and the comment at the top of `usages.ts`.
      graph: new Set(transforms.map((t) => t.name)),
      usages,
      sources: sourceSummaries,
      now: new Date(),
    };
    return ctx;
  };
}

/**
 * Module-singleton runner. We keep the runner's cache scoped per
 * `(scopeKey, userId)` composite so two users mapped to the same active
 * org would still see a fresh build using their own access token (the
 * SailPoint payload itself is tenant-wide, but the fetch needs the
 * caller's resolved token).
 *
 * The builder is created lazily per `userId` because `sailpointFetch`
 * binds to a user — but the cache lives on the runner, so callers always
 * get the right TTL semantics.
 *
 * In practice the inner runner's builder ignores `scopeKey` content; the
 * userId is baked into the closure. The composite key is what guarantees
 * cache isolation.
 */
const runner = createLintRunner({
  buildContext: async (scopeKey) => {
    // The composite key is `${scopeKey}::${userId}` — extract the userId
    // tail so the builder picks up the correct token.
    const idx = scopeKey.lastIndexOf("::");
    const userId = idx >= 0 ? scopeKey.slice(idx + 2) : scopeKey;
    const build = buildLintContextForUser(userId);
    return build(scopeKey);
  },
});

/**
 * Resolve the lint result for `(scopeKey, userId)` with TTL caching.
 *
 * `scopeKey` is what the route derives from the session
 * (`activeOrganizationId ?? userId`); we fold `userId` into the cache key
 * so concurrent users never see each other's results.
 */
export async function getOrComputeLint(
  scopeKey: string,
  userId: string,
  opts?: { force?: boolean },
): Promise<LintCacheEntry | null> {
  return runner.getOrCompute(`${scopeKey}::${userId}`, opts);
}
