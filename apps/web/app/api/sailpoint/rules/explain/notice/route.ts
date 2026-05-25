import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import {
  dismissExplainNotice,
  getExplainNoticeDismissed,
} from "@/lib/db/tenant-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/sailpoint/rules/explain/notice`
 *
 * Returns whether the signed-in user has already dismissed the one-time
 * data-egress notice for the "Explain with AI" feature (epic #373 / #377).
 * The client calls this on first render of the explain panel trigger to
 * decide whether to show the confirmation dialog before the first call.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json(
      { error: "Unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const dismissed = await getExplainNoticeDismissed(session.user.id);
  return Response.json(
    { dismissed },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * `POST /api/sailpoint/rules/explain/notice`
 *
 * Marks the data-egress notice as dismissed for this user. Idempotent.
 * Called by the client immediately after the user clicks "I understand,
 * continue" in the confirmation dialog.
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json(
      { error: "Unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  await dismissExplainNotice(session.user.id);
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
