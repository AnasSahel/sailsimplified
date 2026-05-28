import { randomUUID } from "crypto";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import {
  createContractor,
  listContractors,
  listOrgMembers,
} from "@/lib/contractors/queries";
import {
  ContractorStatusEnum,
  CreateContractorSchema,
} from "@/lib/contractors/schemas";

function orgId(session: Awaited<ReturnType<typeof auth.api.getSession>>) {
  return (session as { session: { activeOrganizationId?: string | null } } | null)
    ?.session?.activeOrganizationId ?? null;
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const org = orgId(session);
  if (!org) {
    return Response.json(
      { error: "No active organization. Select an organization first." },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const sp = url.searchParams;

  const statusRaw = sp.get("status");
  const statusParsed = ContractorStatusEnum.safeParse(statusRaw);
  const status = statusParsed.success ? statusParsed.data : null;
  const sponsorUserId = sp.get("sponsor") || null;
  const q = sp.get("q") || null;
  const cursor = sp.get("cursor") || null;

  const result = await listContractors(org, { status, sponsorUserId, q, cursor });
  return Response.json(result);
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const org = orgId(session);
  if (!org) {
    return Response.json(
      { error: "No active organization. Select an organization first." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateContractorSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Validate that sponsor belongs to this org
  const members = await listOrgMembers(org);
  const sponsorExists = members.some((m) => m.userId === data.sponsor_user_id);
  if (!sponsorExists) {
    return Response.json(
      { error: "Sponsor must be a member of the active organization." },
      { status: 400 },
    );
  }

  try {
    const row = await createContractor({
      id: randomUUID(),
      orgId: org,
      createdBy: session.user.id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      startDate: data.start_date,
      endDate: data.end_date,
      sponsorUserId: data.sponsor_user_id,
      externalRef: data.external_ref ?? null,
      attributes: data.attributes ?? null,
    });
    return Response.json(row, { status: 201 });
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
