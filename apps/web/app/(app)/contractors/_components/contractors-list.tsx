"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { FilterBar } from "@/components/ui/filter-bar";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import {
  type ContractorRow,
  type ContractorStatus,
  type OrgMember,
} from "@/lib/contractors/schemas";

import { ContractorsTable } from "./contractors-table";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "terminated", label: "Terminated" },
] as const;

type Props = {
  initialRows: ContractorRow[];
  initialNextCursor: string | null;
  members: OrgMember[];
  initialStatus: ContractorStatus | null;
  initialSponsor: string | null;
  initialQ: string;
};

export function ContractorsList({
  initialRows,
  initialNextCursor,
  members,
  initialStatus,
  initialSponsor,
  initialQ,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = React.useState<ContractorRow[]>(initialRows);
  const [nextCursor, setNextCursor] = React.useState<string | null>(initialNextCursor);
  const [loading, setLoading] = React.useState(false);

  // Reset rows when URL-driven filters change (server re-renders the parent,
  // which passes new initialRows down — but since this is a client component
  // we reset on prop change).
  const filterKey = `${initialStatus}|${initialSponsor}|${initialQ}`;
  const prevFilterKeyRef = React.useRef(filterKey);
  if (prevFilterKeyRef.current !== filterKey) {
    prevFilterKeyRef.current = filterKey;
    setRows(initialRows);
    setNextCursor(initialNextCursor);
  }

  function buildHref(overrides: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Reset cursor whenever filters change
    params.delete("cursor");
    const qs = params.toString();
    return `/contractors${qs ? `?${qs}` : ""}`;
  }

  const sponsorOptions = members.map((m) => ({
    value: m.userId,
    label: m.name ?? m.email,
  }));

  const hasFilters = Boolean(initialStatus || initialSponsor || initialQ);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (initialStatus) params.set("status", initialStatus);
      if (initialSponsor) params.set("sponsor", initialSponsor);
      if (initialQ) params.set("q", initialQ);
      params.set("cursor", nextCursor);
      const res = await fetch(`/api/v1/contractors?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        rows: ContractorRow[];
        nextCursor: string | null;
      };
      setRows((prev) => [...prev, ...data.rows]);
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <form
            action="/contractors"
            method="get"
            className="relative min-w-[16rem] flex-1"
            role="search"
          >
            {initialStatus && (
              <input type="hidden" name="status" value={initialStatus} />
            )}
            {initialSponsor && (
              <input type="hidden" name="sponsor" value={initialSponsor} />
            )}
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              defaultValue={initialQ}
              placeholder="Search name or email…"
              className="si-body h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Search contractors"
            />
          </form>
        }
        filters={
          <>
            <FilterDropdown
              label="Status"
              value={initialStatus}
              options={STATUS_OPTIONS}
              hrefFor={(v) => buildHref({ status: v })}
              clearLabel="Any status"
            />
            {sponsorOptions.length > 0 && (
              <FilterDropdown
                label="Sponsor"
                value={initialSponsor}
                options={sponsorOptions}
                hrefFor={(v) => buildHref({ sponsor: v })}
                clearLabel="Any sponsor"
              />
            )}
          </>
        }
        clearHref={hasFilters ? "/contractors" : undefined}
      />

      <ContractorsTable
        data={rows}
        hasMore={Boolean(nextCursor)}
        onLoadMore={loadMore}
        loading={loading}
      />
    </div>
  );
}
