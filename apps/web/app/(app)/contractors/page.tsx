import { headers } from "next/headers";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { listContractors, listOrgMembers } from "@/lib/contractors/queries";
import { type ContractorStatus } from "@/lib/contractors/schemas";

import { PageShell } from "../_components/page-shell";
import { ContractorsList } from "./_components/contractors-list";

function statusParam(v: string | undefined): ContractorStatus | null {
  if (v === "active" || v === "expired" || v === "terminated") return v;
  return null;
}

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    sponsor?: string;
    q?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const params = await searchParams;
  const status = statusParam(params.status);
  const sponsorUserId = params.sponsor ?? null;
  const q = (params.q ?? "").trim();

  const orgId = (session.session as { activeOrganizationId?: string | null })
    .activeOrganizationId ?? null;

  if (!orgId) {
    return (
      <PageShell
        title="Contractors"
        description="Manage external contractors and their access periods."
      >
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 si-body text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          No active organization. Select an organization to manage contractors.
        </div>
      </PageShell>
    );
  }

  const [result, members] = await Promise.all([
    listContractors(orgId, { status, sponsorUserId: sponsorUserId || null, q: q || null }),
    listOrgMembers(orgId),
  ]);

  return (
    <PageShell
      title="Contractors"
      description="Manage external contractors and their access periods."
      actions={
        <Button asChild>
          <Link href="/contractors/new">
            <Plus className="h-4 w-4" />
            New contractor
          </Link>
        </Button>
      }
    >
      <ContractorsList
        initialRows={result.rows}
        initialNextCursor={result.nextCursor}
        members={members}
        initialStatus={status}
        initialSponsor={sponsorUserId}
        initialQ={q}
      />
    </PageShell>
  );
}
