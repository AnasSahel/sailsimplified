import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getOrComputeLint } from "@/lib/sailpoint/lint-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/sailpoint/transforms/lint?force=1`
 *
 * Returns the latest lint result for the caller's scope (active org →
 * user fallback) using the 5-minute cached runner. `?force=1` bypasses
 * the cache and forces a fresh scan.
 *
 * Response shape mirrors `LintResult` from `@simplified-identity/transforms`,
 * with `byTransformId` flattened to a plain object so JSON.stringify
 * preserves it (Maps would serialise to `{}`). Issue arrays are emitted
 * verbatim; the client knows the `Issue` shape via the same package.
 *
 * Auth is reused from better-auth (same pattern as
 * `apps/web/app/api/identities/export/route.ts`). The route does not
 * touch the DB beyond what `getOrComputeLint` does indirectly via
 * `sailpointFetch` (token resolution + refresh).
 *
 * Architecture decisions: see ADR
 * `vault/Projects/Simplified Identity/2026-05-14-transforms-lint-architecture.md`.
 */

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json(
      { error: "Unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  const userId = session.user.id;
  // Better-auth's organization plugin stores the active org id on the
  // session row. We fall back to `userId` so users without an active
  // organisation still get a stable cache key (cf. ADR §Q1 "scoped per
  // orgId" — orgId in our setup is the user's tenancy boundary, with
  // userId as the natural fallback when no org is active).
  const scopeKey =
    (session.session as { activeOrganizationId?: string | null })
      .activeOrganizationId ?? userId;

  try {
    const entry = await getOrComputeLint(scopeKey, userId, { force });
    if (!entry) {
      return Response.json(
        { error: "SailPoint not connected or transforms unavailable." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { result, scannedAt } = entry;

    // `byTransformId` is a `Map` — serialise to a plain object so JSON
    // round-trips through the wire as the client expects.
    const byTransformId: Record<string, unknown> = {};
    for (const [transformId, issues] of result.byTransformId) {
      byTransformId[transformId] = issues;
    }

    return Response.json(
      {
        scannedAt: scannedAt.toISOString(),
        errors: result.errors,
        warnings: result.warnings,
        byTransformId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[transforms/lint] compute failed:", err);
    return Response.json(
      { error: "Lint compute failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
