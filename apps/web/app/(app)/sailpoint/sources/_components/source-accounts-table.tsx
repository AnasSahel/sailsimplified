"use client";

import * as React from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";

import { TimestampCell } from "@/components/cells/timestamp-cell";
import { DataTable } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { AccountsBulkBar } from "./accounts-bulk-bar";

export type SourceAccountRow = {
  id: string;
  name: string | null;
  nativeIdentity: string | null;
  identityId: string | null;
  authoritative: boolean;
  disabled: boolean;
  locked: boolean;
  modified: string | null;
  /**
   * Best-effort managerId extracted from `account.attributes` via the
   * connector-agnostic whitelist (`manager`, `managerId`, `manager_id`).
   * Null when the connector doesn't expose one — the column still
   * renders the header but the cell stays empty (part of the issue #261
   * spec — don't hide the column for inconsistent connectors).
   */
  managerId: string | null;
  /**
   * Per-account entitlement count, pre-fetched server-side. `null` when
   * the count failed (auth / network) — rendered as an em-dash. `0` is
   * a valid value and renders as "0" (issue #261 acceptance).
   */
  entitlementCount: number | null;
};

const ABSOLUTE_DTF = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

function AuthBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0 si-micro font-semibold uppercase tracking-wider text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300">
      AUTH
    </span>
  );
}

/**
 * Last-refresh cell with a tooltip that exposes the absolute timestamp.
 * Issue #261 acceptance: tooltip must show the raw ISO value alongside
 * the human-readable formatting — both are useful (ISO for copy/grep,
 * formatted for readability).
 */
function LastRefreshCell({ value }: { value: string | null }) {
  if (!value) {
    return <span className="si-caption text-muted-foreground/50">—</span>;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return <span className="si-caption text-muted-foreground/50">—</span>;
  }
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">
            <TimestampCell value={value} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="flex flex-col gap-0.5 leading-tight">
            <span className="font-mono">{value}</span>
            <span className="text-primary-foreground/70">
              {ABSOLUTE_DTF.format(d)}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SourceAccountsTable({
  data,
  sourceId,
  emptyState,
}: {
  data: SourceAccountRow[];
  /**
   * Source id used by the bulk-action server actions for `revalidatePath`
   * after a successful submission. Optional so existing callers (none
   * left in-tree, but contract stays backwards-compatible) don't break
   * if they only want the table without the bulk bar.
   */
  sourceId?: string;
  /**
   * Override the default empty-state copy. Used when the page applies
   * filters that yield zero rows — the caller passes a message that
   * explains the filter is the cause, not an empty source.
   */
  emptyState?: React.ReactNode;
}) {
  const columns = React.useMemo<ColumnDef<SourceAccountRow, unknown>[]>(
    () => [
      {
        id: "account",
        accessorKey: "name",
        header: "Account",
        meta: { widthClass: "w-[22%]" },
        cell: ({ row }) => {
          const { name, nativeIdentity, authoritative } = row.original;
          const primary = name ?? nativeIdentity ?? row.original.id;
          const showSub = nativeIdentity && nativeIdentity !== primary;
          return (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="inline-flex items-center truncate si-body font-medium">
                {primary}
                {authoritative && <AuthBadge />}
              </span>
              {showSub && (
                <span className="truncate si-caption text-muted-foreground font-mono">
                  {nativeIdentity}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "identity",
        accessorKey: "identityId",
        header: "Identity",
        meta: { widthClass: "w-[18%]" },
        cell: ({ row }) => {
          const { identityId } = row.original;
          if (!identityId) {
            return (
              <Pill tone="warning" dot>
                Orphan
              </Pill>
            );
          }
          return (
            <Link
              href={`/sailpoint/identities/${encodeURIComponent(identityId)}`}
              className="si-caption font-mono text-primary hover:underline"
              // Stop the row-click handler in DataTable from firing — this
              // anchor has its own destination distinct from the row href.
              onClick={(e) => e.stopPropagation()}
            >
              {identityId}
            </Link>
          );
        },
      },
      {
        id: "manager",
        accessorKey: "managerId",
        header: "Manager",
        meta: { widthClass: "w-[18%]" },
        cell: ({ row }) => {
          const { managerId } = row.original;
          if (!managerId) {
            // Empty cell — the column still renders the header, per
            // issue #261 acceptance (don't hide it just because some
            // accounts lack a manager).
            return (
              <span className="si-caption text-muted-foreground/50">—</span>
            );
          }
          // Best-effort: link to the identity detail page assuming
          // managerId resolves to an identity id. Connectors that store
          // a DN or external native identity in this attribute will
          // produce a 404 on click — acceptable trade-off vs the
          // alternative of a per-row identity lookup. Issue #261 spec:
          // "Manager cell links to the identity detail page when the
          // managerId resolves to an identity."
          return (
            <Link
              href={`/sailpoint/identities/${encodeURIComponent(managerId)}`}
              className="si-caption font-mono text-primary hover:underline truncate inline-block max-w-full"
              title={managerId}
              onClick={(e) => e.stopPropagation()}
            >
              {managerId}
            </Link>
          );
        },
      },
      {
        id: "entitlements",
        accessorKey: "entitlementCount",
        header: "Entitlements",
        meta: { widthClass: "w-28" },
        cell: ({ row }) => {
          const { entitlementCount } = row.original;
          if (entitlementCount === null) {
            return (
              <span className="si-caption text-muted-foreground/50">—</span>
            );
          }
          // Render `0` (not blank) for accounts with zero entitlements,
          // per issue #261 acceptance.
          return (
            <span className="si-caption tabular-nums">
              {entitlementCount}
            </span>
          );
        },
        sortingFn: (a, b) => {
          // Null counts sort last in both directions — they represent
          // failed counts, not zero, so lumping them with 0 would lie.
          const av = a.original.entitlementCount;
          const bv = b.original.entitlementCount;
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return av - bv;
        },
      },
      {
        id: "state",
        header: "State",
        meta: { widthClass: "w-32" },
        cell: ({ row }) => {
          const { disabled, locked } = row.original;
          if (disabled && locked) {
            return (
              <Pill tone="danger" dot>
                Disabled · Locked
              </Pill>
            );
          }
          if (disabled) {
            return (
              <Pill tone="warning" dot>
                Disabled
              </Pill>
            );
          }
          if (locked) {
            return (
              <Pill tone="warning" dot>
                Locked
              </Pill>
            );
          }
          return (
            <Pill tone="success" dot>
              Active
            </Pill>
          );
        },
      },
      {
        id: "modified",
        accessorKey: "modified",
        header: "Last refresh",
        meta: { widthClass: "w-32" },
        cell: ({ row }) => <LastRefreshCell value={row.original.modified} />,
      },
    ],
    [],
  );

  return (
    <DataTable
      data={data}
      columns={columns}
      rowKey={(r) => r.id}
      selection={Boolean(sourceId)}
      toolbar={
        sourceId
          ? ({ selectedIds, clearSelection }) => {
              if (selectedIds.length === 0) return null;
              // Re-derive the selected rows from `data` so the bulk bar
              // can evaluate `disabled`/`identityId` state for the
              // "greyed when nonsensical" rule without us threading the
              // full row payload through TanStack's selection model.
              const selectedSet = new Set(selectedIds);
              const selectedRows = data
                .filter((r) => selectedSet.has(r.id))
                .map((r) => ({
                  id: r.id,
                  disabled: r.disabled,
                  identityId: r.identityId,
                }));
              return (
                <AccountsBulkBar
                  selected={selectedRows}
                  sourceId={sourceId}
                  onCleared={clearSelection}
                />
              );
            }
          : undefined
      }
      emptyState={emptyState ?? "No accounts on this source."}
    />
  );
}
