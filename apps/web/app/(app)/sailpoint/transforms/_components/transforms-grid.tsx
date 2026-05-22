"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { UsageEntry } from "@simplified-identity/transforms";

import { TypeIcon, TypePill } from "../../../_components/type-pill";
import { IssuesBadge, type IssuesBadgeCounts } from "./issues-badge";
import { OriginPill } from "./origin-pill";
import { RowActions } from "./row-actions";
import { UsagesCell } from "./usages-cell";

export type GridTransform = {
  id: string;
  name: string;
  type: string;
  internal?: boolean;
  usages?: number;
};

export function TransformsGrid({
  transforms,
  tenantTransformNames,
  usagesByName,
  issuesByTransformId,
}: {
  transforms: GridTransform[];
  /** Live list of all transform names in the tenant — fed to row-level
   * Duplicate so the dialog can pre-compute a unique default name. */
  tenantTransformNames: ReadonlyArray<string>;
  /** Per-transform usage breakdown (#315) — fed into the Usages cell tooltip.
   * Optional so callers without the roll-up still type-check. */
  usagesByName?: ReadonlyMap<string, ReadonlyArray<UsageEntry>>;
  /** Per-transform lint counts (#310 PR 4/4) — drives the inline issues
   * badge next to the name. Keyed by `transform.id`, omitted when zero. */
  issuesByTransformId?: ReadonlyMap<string, IssuesBadgeCounts>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectHref = React.useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("selected", id);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  if (transforms.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
        No transforms in this view.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {transforms.map((t) => (
        <div
          key={t.id}
          className="group relative flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <Link
              href={selectHref(t.id)}
              scroll={false}
              className="flex min-w-0 items-center gap-2 hover:underline"
            >
              <TypeIcon type={t.type} />
              <span className="truncate font-mono text-xs font-medium">
                {t.name}
              </span>
              {/* Visual order: name → issues badge (per ADR / issue #310 PR 4/4). */}
              <IssuesBadge counts={issuesByTransformId?.get(t.id)} />
            </Link>
            <RowActions
              id={t.id}
              name={t.name}
              usages={t.usages}
              internal={t.internal}
              tenantTransformNames={tenantTransformNames}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <TypePill type={t.type} />
            <div className="flex items-center gap-2">
              <UsagesCell
                usages={t.usages}
                internal={t.internal}
                transformId={t.id}
                usagesEntries={usagesByName?.get(t.name)}
              />
              <OriginPill internal={t.internal} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
