"use client";

import { type ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { DataTable } from "@/components/ui/data-table";
import { type ContractorRow } from "@/lib/contractors/schemas";

import { StatusPill } from "./status-pill";

export type ContractorTableRow = ContractorRow;

const columns: ColumnDef<ContractorTableRow, unknown>[] = [
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div className="flex flex-col">
          <span className="si-body font-medium">
            {c.firstName} {c.lastName}
          </span>
          <span className="si-caption text-muted-foreground">{c.email}</span>
        </div>
      );
    },
  },
  {
    id: "sponsor",
    header: "Sponsor",
    cell: ({ row }) => {
      const name = row.original.sponsorName;
      return (
        <span className="si-body text-muted-foreground">
          {name ?? <span className="italic opacity-50">—</span>}
        </span>
      );
    },
    meta: { mobileHidden: true },
  },
  {
    id: "period",
    header: "Start → End",
    cell: ({ row }) => {
      const { startDate, endDate } = row.original;
      return (
        <span className="si-caption font-mono text-muted-foreground whitespace-nowrap">
          {startDate} → {endDate}
        </span>
      );
    },
    meta: { mobileHidden: true },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <StatusPill status={row.original.status} />,
  },
];

export function ContractorsTable({
  data,
  onLoadMore,
  hasMore,
  loading,
}: {
  data: ContractorTableRow[];
  onLoadMore?: () => void;
  hasMore: boolean;
  loading?: boolean;
}) {
  return (
    <div className="space-y-3">
      <DataTable
        data={data}
        columns={columns}
        rowKey={(row) => row.id}
        rowHref={(row) => `/contractors/${row.id}`}
        mobileLayout="cards"
        emptyState={
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="si-body text-muted-foreground">
              No contractors yet.{" "}
              <Link
                href="/contractors/new"
                className="text-primary underline-offset-4 hover:underline"
              >
                Add your first one.
              </Link>
            </p>
          </div>
        }
      />
      {hasMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={onLoadMore}
            className="si-body rounded-md border border-input bg-card px-4 py-2 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
