import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { getContractor, listOrgMembers } from "@/lib/contractors/queries";

import { PageShell } from "../../_components/page-shell";
import { ContractorForm } from "../_components/contractor-form";
import { StatusPill } from "../_components/status-pill";

export default async function ContractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const { id } = await params;

  const orgId = (session.session as { activeOrganizationId?: string | null })
    .activeOrganizationId ?? null;

  if (!orgId) {
    return (
      <PageShell title="Contractor" description="">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 si-body text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          No active organization.
        </div>
      </PageShell>
    );
  }

  const [contractor, members] = await Promise.all([
    getContractor(orgId, id),
    listOrgMembers(orgId),
  ]);

  if (!contractor) notFound();

  const fullName = `${contractor.firstName} ${contractor.lastName}`;

  return (
    <PageShell
      title={fullName}
      description={contractor.email}
      actions={
        <div className="flex items-center gap-2">
          <StatusPill status={contractor.status} />
        </div>
      }
    >
      <div className="space-y-6">
        <Link
          href="/contractors"
          className="inline-flex items-center gap-1.5 si-caption text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to contractors
        </Link>

        <div className="rounded-lg border bg-card p-1">
          <dl className="grid grid-cols-2 gap-px sm:grid-cols-4">
            <MetaCell label="Created">
              {contractor.createdAt.toLocaleDateString(undefined, {
                dateStyle: "medium",
              })}
            </MetaCell>
            <MetaCell label="Last updated">
              {contractor.updatedAt.toLocaleDateString(undefined, {
                dateStyle: "medium",
              })}
            </MetaCell>
            <MetaCell label="External ref">
              {contractor.externalRef ?? (
                <span className="italic opacity-50">—</span>
              )}
            </MetaCell>
            <MetaCell label="Status">
              <StatusPill status={contractor.status} />
            </MetaCell>
          </dl>
        </div>

        <div className="max-w-2xl">
          <ContractorForm mode="edit" initial={contractor} members={members} />
        </div>
      </div>
    </PageShell>
  );
}

function MetaCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <dt className="si-micro uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="si-body">{children}</dd>
    </div>
  );
}
