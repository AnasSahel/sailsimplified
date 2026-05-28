import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import {
  getContractor,
  listOrgMembers,
  softDeleteContractor,
  updateContractor,
} from "@/lib/contractors/queries";
import { UpdateContractorSchema } from "@/lib/contractors/schemas";

function orgId(session: Awaited<ReturnType<typeof auth.api.getSession>>) {
  return (session as { session: { activeOrganizationId?: string | null } } | null)
    ?.session?.activeOrganizationId ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const row = await getContractor(org, id);
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(row);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const org = orgId(session);
  if (!org) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }

  const { id } = await params;

  const existing = await getContractor(org, id);
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateContractorSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Validate that new sponsor (if provided) belongs to this org
  if (data.sponsor_user_id) {
    const members = await listOrgMembers(org);
    const sponsorExists = members.some((m) => m.userId === data.sponsor_user_id);
    if (!sponsorExists) {
      return Response.json(
        { error: "Sponsor must be a member of the active organization." },
        { status: 400 },
      );
    }
  }

  try {
    const row = await updateContractor(org, id, {
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      startDate: data.start_date,
      endDate: data.end_date,
      sponsorUserId: data.sponsor_user_id,
      externalRef: data.external_ref ?? null,
      attributes: data.attributes ?? null,
      ...(data.deleted_at === null ? { deletedAt: null } : {}),
    });
    return Response.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("UNIQUE") || message.includes("idx_contractor_org_email")) {
      return Response.json(
        { error: "A contractor with this email already exists in your organization." },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const org = orgId(session);
  if (!org) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }

  const { id } = await params;

  const existing = await getContractor(org, id);
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await softDeleteContractor(org, id);
  return new Response(null, { status: 204 });
}
