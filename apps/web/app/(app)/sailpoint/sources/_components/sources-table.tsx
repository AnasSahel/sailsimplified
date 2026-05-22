"use client";

import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import type { AggregationHealth } from "@/lib/sailpoint/source-health";

import { AggregationHealthPill } from "./aggregation-health-pill";
import { HealthPill } from "./health-pill";
import { LastAggregationCell } from "./last-aggregation-cell";
import { SourceAvatar } from "./source-avatar";
import { SourcesRowActions } from "./sources-row-actions";

/**
 * Pinned to `en-US` so digit grouping renders identically on the server
 * (SSR) and on the client (after hydration). `.toLocaleString()` with
 * the default locale flips between "1,681" (en) and "1 681" (fr),
 * which Next reports as a hydration mismatch.
 */
const NUMBER_FMT = new Intl.NumberFormat("en-US");

export type SourceRow = {
  id: string;
  name: string;
  description: string | null;
  connector: string | null;
  connectorName: string | null;
  connectorClass: string | null;
  type: string | null;
  authoritative: boolean;
  healthy?: boolean;
  status: string | null;
  since: string | null;
  owner: { id: string; name: string } | null;
  cluster: { id: string; name: string } | null;
  accountCount: number | null;
  /** Pre-computed aggregation health (#144). Drives both the row pill
   *  in the Source cell and the colored sub-line of the Last
   *  aggregation cell — shared so they can't drift. */
  aggregationHealth: AggregationHealth;
};

function AuthoritativePill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 si-micro font-medium text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet-500" />
      Authoritative
    </span>
  );
}

/**
 * Source-cell sub-line: "{connector type} · Owner: {name} · ID {prefix…suffix}".
 * Each piece is optional — missing values just collapse out.
 */
function SourceSubLine({ row }: { row: SourceRow }) {
  const pieces: string[] = [];
  if (row.type) pieces.push(row.type);
  if (row.owner) pieces.push(`Owner: ${row.owner.name}`);
  const idAbbrev = abbreviateId(row.id);
  if (idAbbrev) pieces.push(`ID ${idAbbrev}`);
  if (pieces.length === 0) return null;
  return (
    <span className="truncate si-caption text-muted-foreground">
      {pieces.join(" · ")}
    </span>
  );
}

function abbreviateId(id: string): string | null {
  if (!id) return null;
  if (id.length <= 12) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

/**
 * Light prettifier for the connector-kind tag in parens after the
 * connector name. Matches the design vocabulary (SaaS / File / Direct).
 */
function prettyConnectorKind(kind: string): string {
  const k = kind.toLowerCase();
  if (k.includes("openconnector") || k.includes("saas")) return "SaaS";
  if (k.includes("file") || k.includes("delimited")) return "File";
  if (k.includes("direct")) return "Direct";
  if (k.includes("scim")) return "SaaS";
  return kind
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SourcesTable({ data }: { data: SourceRow[] }) {
  const columns = React.useMemo<ColumnDef<SourceRow, unknown>[]>(
    () => [
      {
        id: "source",
        accessorKey: "name",
        header: "Source",
        meta: { widthClass: "w-[28%]" },
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <SourceAvatar
              name={row.original.name}
              connector={row.original.connector}
            />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="inline-flex items-center gap-2">
                <span className="truncate si-body font-medium">
                  {row.original.name}
                </span>
                {row.original.authoritative && <AuthoritativePill />}
                <AggregationHealthPill
                  health={row.original.aggregationHealth}
                />
              </span>
              <SourceSubLine row={row.original} />
            </div>
          </div>
        ),
      },
      {
        id: "connector",
        accessorKey: "connectorName",
        header: "Connector",
        meta: { widthClass: "w-[14%]" },
        cell: ({ row }) => {
          const label =
            row.original.connectorName ?? row.original.connector ?? null;
          if (!label) {
            return (
              <span className="si-caption text-muted-foreground/50">—</span>
            );
          }
          const kind = row.original.connectorClass ?? row.original.type;
          return (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate si-body" title={label}>
                {label}
              </span>
              {kind && (
                <span className="si-caption text-muted-foreground">
                  {prettyConnectorKind(kind)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "accounts",
        accessorKey: "accountCount",
        header: "Accounts",
        meta: { widthClass: "w-24", align: "right" },
        cell: ({ row }) => {
          const n = row.original.accountCount;
          if (n === null) {
            return (
              <span className="si-caption text-muted-foreground/50">—</span>
            );
          }
          return (
            <span className="si-body font-mono tabular-nums">
              {NUMBER_FMT.format(n)}
            </span>
          );
        },
      },
      {
        id: "since",
        accessorKey: "since",
        header: "Last aggregation",
        meta: { widthClass: "w-44" },
        cell: ({ row }) => (
          <LastAggregationCell
            since={row.original.since}
            health={row.original.aggregationHealth}
          />
        ),
      },
      {
        id: "health",
        accessorKey: "healthy",
        header: "Health",
        meta: { widthClass: "w-40" },
        cell: ({ row }) => (
          <HealthPill
            healthy={row.original.healthy}
            status={row.original.status}
          />
        ),
      },
      {
        id: "cluster",
        accessorKey: "cluster",
        header: "Cluster",
        meta: { widthClass: "w-32" },
        cell: ({ row }) =>
          row.original.cluster ? (
            <span className="si-caption font-mono">
              {row.original.cluster.name}
            </span>
          ) : (
            <span className="si-caption text-muted-foreground/50">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <DataTable
      data={data}
      columns={columns}
      rowKey={(r) => r.id}
      rowHref={(r) => `/sailpoint/sources/${encodeURIComponent(r.id)}`}
      rowActions={(r) => <SourcesRowActions id={r.id} name={r.name} />}
      emptyState="No sources match these filters."
    />
  );
}
