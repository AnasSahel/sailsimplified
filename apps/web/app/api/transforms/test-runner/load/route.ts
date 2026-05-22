import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import {
  getIdentity,
  getIdentityAccounts,
} from "@/lib/sailpoint/identities-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/transforms/test-runner/load?id=<identityId>
 *
 * Loads a single identity + its connected accounts and flattens them into
 * the `simulatedValues` shape consumed by the transform evaluator. Two
 * key prefixes:
 *  - `identity.<attr>` from `/v2025/identities/{id}` `.attributes`
 *  - `account.<sourceName>.<attr>` from `/v2025/accounts?filters=identityId eq …`
 *
 * Scalar values only (string / number / boolean) — null and nested
 * objects are skipped because the evaluator expects flat strings.
 *
 * Accounts is best-effort: if it fails we still return the identity so
 * the user can run a transform that doesn't depend on `accountAttribute`.
 */

type LoadedIdentity = {
  id: string;
  name: string;
  email: string | null;
};

type LoadResponse =
  | {
      ok: true;
      identity: LoadedIdentity;
      simulatedValues: Record<string, string>;
      stats: {
        identityAttrCount: number;
        accountCount: number;
        accountsLoaded: boolean;
      };
    }
  | { ok: false; error: string };

function jsonResponse(body: LoadResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function flattenScalar(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // Skip objects / arrays — the evaluator expects flat strings, and most
  // ISC scalar attributes worth simulating live at the top level. Nested
  // shapes (manager refs, complex objects) would need bespoke flattening
  // that the transform evaluator doesn't currently understand.
  return null;
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return jsonResponse({ ok: false, error: "Unauthenticated" }, 401);
  }

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) {
    return jsonResponse({ ok: false, error: "Missing id" }, 400);
  }

  const identityResult = await getIdentity(session.user.id, id);
  if (!identityResult.ok) {
    return jsonResponse(
      { ok: false, error: identityResult.message },
      identityResult.status >= 400 ? identityResult.status : 502,
    );
  }

  const identity = identityResult.data;
  const simulatedValues: Record<string, string> = {};
  const attrs = identity.attributes ?? {};

  for (const [key, value] of Object.entries(attrs)) {
    const flat = flattenScalar(value);
    if (flat !== null) {
      simulatedValues[`identity.${key}`] = flat;
    }
  }
  const identityAttrCount = Object.keys(simulatedValues).length;

  // Accounts pull is best-effort. Surfacing the identity alone is better
  // than a hard 5xx — the user can still test transforms that only read
  // `identity.*`.
  const accountsResult = await getIdentityAccounts(session.user.id, id);
  let accountCount = 0;
  let accountsLoaded = false;
  if (accountsResult.ok) {
    accountsLoaded = true;
    for (const account of accountsResult.data) {
      if (!account.sourceName || !account.attributes) continue;
      accountCount += 1;
      for (const [key, value] of Object.entries(account.attributes)) {
        const flat = flattenScalar(value);
        if (flat !== null) {
          simulatedValues[`account.${account.sourceName}.${key}`] = flat;
        }
      }
    }
  }

  // `IdentityDetail` doesn't formally type `emailAddress`, but ISC returns
  // it as a top-level scalar on the v2025 endpoint. Cast through the
  // generic record to surface it for the header without breaking the type.
  const emailFromRoot =
    typeof (identity as { emailAddress?: unknown }).emailAddress === "string"
      ? ((identity as { emailAddress: string }).emailAddress)
      : null;
  const emailFromAttrs =
    typeof attrs.email === "string"
      ? (attrs.email as string)
      : typeof attrs.emailAddress === "string"
        ? (attrs.emailAddress as string)
        : null;

  return jsonResponse(
    {
      ok: true,
      identity: {
        id: identity.id,
        name: identity.name,
        email: emailFromRoot ?? emailFromAttrs,
      },
      simulatedValues,
      stats: {
        identityAttrCount,
        accountCount,
        accountsLoaded,
      },
    },
    200,
  );
}
