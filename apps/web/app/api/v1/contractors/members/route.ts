import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { listOrgMembers } from "@/lib/contractors/queries";

function orgId(session: Awaited<ReturnType<typeof auth.api.getSession>>) {
  return (session as { session: { activeOrganizationId?: string | null } } | null)
    ?.session?.activeOrganizationId ?? null;
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const org = orgId(session);
  if (!org) {
    return Response.json(
      { error: "No active organization." },
      { status: 400 },
    );
  }

  const members = await listOrgMembers(org);
  return Response.json(members);
}
