import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { listOrgMembers } from "@/lib/contractors/queries";

import { PageShell } from "../../_components/page-shell";
import { ContractorForm } from "../_components/contractor-form";

export default async function NewContractorPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const orgId = (session.session as { activeOrganizationId?: string | null })
    .activeOrganizationId ?? null;

  if (!orgId) {
    return (
      <PageShell
        title="New contractor"
        description="Add an external contractor to your organization."
      >
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 si-body text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          No active organization. Select an organization first.
        </div>
      </PageShell>
    );
  }

  const members = await listOrgMembers(orgId);

  return (
    <PageShell
      title="New contractor"
      description="Add an external contractor to your organization."
    >
      <div className="max-w-2xl">
        <ContractorForm mode="new" initial={null} members={members} />
      </div>
    </PageShell>
  );
}
