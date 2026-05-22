/**
 * Pure cache + factory for the lint runner. Lives in a separate file from
 * `lint-runner.ts` so the unit test can import this without dragging in
 * `server-only`, `next/headers`, the better-auth runtime, etc.
 *
 * The default (production) runner is composed in `lint-runner.ts`; this
 * file owns no I/O and no module state — every cache instance is owned
 * by the runner the factory returns.
 *
 * Architecture: ADR
 * `vault/Projects/Simplified Identity/2026-05-14-transforms-lint-architecture.md`
 * §Q1 (sync on demand + 5-min cache).
 */

import {
  runLint,
  type LintContext,
  type LintResult,
} from "@simplified-identity/transforms";

export const LINT_TTL_MS = 5 * 60 * 1000;

export type LintCacheEntry = { result: LintResult; scannedAt: Date };

/**
 * Pluggable context-builder: returns the full `LintContext` for a given
 * scope, or `null` when the underlying inputs cannot be fetched. The
 * factory keeps this dep injectable so the unit test can mock it without
 * standing up a fake `sailpointFetch`.
 */
export type BuildLintContext = (
  scopeKey: string,
) => Promise<LintContext | null>;

/**
 * Factory for a cached lint runner. Encapsulates the cache `Map` and
 * the TTL behaviour, takes the context builder as a dep so tests can
 * inject a mock and clock, and returns the only function the API route
 * needs (`getOrCompute`).
 *
 * Functional pattern (no class) per the repo's TS style guide
 * (`projects/.claude/rules/typescript-style.md`).
 */
export function createLintRunner(opts: {
  buildContext: BuildLintContext;
  ttlMs?: number;
  now?: () => number;
}) {
  const ttlMs = opts.ttlMs ?? LINT_TTL_MS;
  const now = opts.now ?? (() => Date.now());
  const cache = new Map<string, LintCacheEntry>();

  return {
    async getOrCompute(
      scopeKey: string,
      runOpts?: { force?: boolean },
    ): Promise<LintCacheEntry | null> {
      const cached = cache.get(scopeKey);
      if (
        !runOpts?.force &&
        cached &&
        now() - cached.scannedAt.getTime() < ttlMs
      ) {
        return cached;
      }

      const ctx = await opts.buildContext(scopeKey);
      if (!ctx) return null;

      const entry: LintCacheEntry = {
        result: runLint(ctx),
        // Use the runner's clock so tests are reproducible.
        scannedAt: new Date(now()),
      };
      cache.set(scopeKey, entry);
      return entry;
    },
  };
}
