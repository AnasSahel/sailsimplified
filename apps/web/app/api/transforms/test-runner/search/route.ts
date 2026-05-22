import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { searchPublicIdentities } from "@/lib/sailpoint/identities-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/transforms/test-runner/search?q=foo&limit=10
 *
 * Identity search dropdown for the transform Test tab "Pick an identity"
 * dialog. Wraps `/v2025/public-identities` with a SCIM filter on the
 * four queryable string fields (`firstname`, `lastname`, `email`,
 * `alias`). Server-side only — the access token never leaves this
 * handler.
 */

const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 10;

type IdentityRow = {
  id: string;
  name: string;
  email: string | null;
};

type SearchResponse =
  | { ok: true; identities: IdentityRow[] }
  | { ok: false; error: string };

function jsonResponse(body: SearchResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return jsonResponse({ ok: false, error: "Unauthenticated" }, 401);
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.trunc(limitRaw)), MAX_LIMIT)
    : DEFAULT_LIMIT;

  if (q.length === 0) {
    return jsonResponse({ ok: true, identities: [] }, 200);
  }

  const result = await searchPublicIdentities(session.user.id, { q, limit });
  if (!result.ok) {
    return jsonResponse(
      { ok: false, error: result.message },
      result.status >= 400 ? result.status : 502,
    );
  }

  const identities: IdentityRow[] = result.data.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email ?? null,
  }));

  return jsonResponse({ ok: true, identities }, 200);
}
