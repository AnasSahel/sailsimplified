"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Pill } from "@/components/ui/pill";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  groupTransformsByType,
  type UsageEntry,
} from "@simplified-identity/transforms";

import { TypeIcon, TypePill } from "../../../_components/type-pill";
import { IssuesBadge, type IssuesBadgeCounts } from "./issues-badge";
import { LastModifiedCell } from "./last-modified-cell";
import { OriginPill } from "./origin-pill";
import { BulkActionBar } from "./bulk-action-bar";
import { RowActions } from "./row-actions";
import type { SelectableTransform } from "./types";
import { UsagesCell } from "./usages-cell";

/**
 * Transforms table — flat by default, optionally grouped by `transform.type`
 * with sticky collapsible group headers. Decisions locked by the **Amendment**
 * at the top of ADR
 * `vault/Projects/Simplified Identity/2026-05-14-transforms-list-grouping-by-type.md`
 * (after the second pixel review):
 *
 *   - Q5 grouping is OPT-IN. Default render is the flat table; the
 *     grouped layout activates when the toolbar `Group by` chip selects
 *     `Type` (URL `?groupBy=type`, parsed in the page handler).
 *   - Q1 grouping dimension = root `type` (`lookup`, `firstValid`, ...).
 *   - Q2 no cap — ISC exposes ~15-20 distinct types max.
 *   - Q3 collapsed state persisted in URL via `?groups.<type>=closed`,
 *     orthogonal to `?groupBy=`. The chip clears these markers on toggle off.
 *   - Q4 the per-row Type column is visible only in the flat layout.
 *
 * The grid view (`transforms-grid.tsx`) is intentionally NOT grouped —
 * grouping is table-only per the ADR.
 */

/**
 * URL param names live in a single namespace prefix so they don't
 * collide with the page's other filter params (`type`, `origin`, ...).
 */
const URL_GROUP_PREFIX = "groups.";

function urlParamForGroup(type: string): string {
  return `${URL_GROUP_PREFIX}${type}`;
}

export function TransformsTable({
  data,
  tenantTransformNames,
  usagesByName,
  issuesByTransformId,
  groupBy = null,
}: {
  data: SelectableTransform[];
  /** Live list of all transform names in the tenant — fed to row-level
   * Duplicate so the dialog can pre-compute a unique default name. */
  tenantTransformNames: ReadonlyArray<string>;
  /** Per-transform usage breakdown (#315 — fed into the Usages cell tooltip).
   * Optional so callers that don't have the roll-up still type-check. */
  usagesByName?: ReadonlyMap<string, ReadonlyArray<UsageEntry>>;
  /** Per-transform lint counts (#310 PR 4/4 — drives the inline issues
   * badge next to the Name cell). Keyed by `transform.id`, omitted when
   * the transform has zero issues. Optional so callers without the lint
   * pass still type-check. */
  issuesByTransformId?: ReadonlyMap<string, IssuesBadgeCounts>;
  /**
   * When `"type"`, render one `<tbody>` per transform type with sticky
   * collapsible headers. When `null` (default), render the flat table —
   * one `<tbody>` with all rows and the Type column visible.
   */
  groupBy?: "type" | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const grouped = groupBy === "type";

  // select + name + (type) + usages + modified + actions. The Type column
  // is only present in the flat layout — when grouping is active the
  // group header already names the type (Q4 of the ADR), so colspans
  // collapse by one. Origin is shown as an inline pill in the Name cell
  // (no dedicated column).
  const numColumns = grouped ? 5 : 6;

  // Grouping is recomputed on the visible (already-filtered) subset,
  // satisfying the "filter-aware: empty groups disappear" requirement.
  // We always run it (cheap) so the grouped branch can render off it
  // without an effect — keeps the code path symmetric.
  const groups = React.useMemo(() => groupTransformsByType(data), [data]);

  const closedSet = React.useMemo(() => {
    const out = new Set<string>();
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith(URL_GROUP_PREFIX) && value === "closed") {
        out.add(key.slice(URL_GROUP_PREFIX.length));
      }
    }
    return out;
  }, [searchParams]);

  const toggleGroupClosed = React.useCallback(
    (type: string, nextClosed: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      const key = urlParamForGroup(type);
      if (nextClosed) {
        params.set(key, "closed");
      } else {
        params.delete(key);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const selectHref = React.useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("selected", id);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  // Selection — kept local; mirrors the DataTable's single-page contract
  // (selection scoped to what's currently rendered). Stored as a raw
  // Set; we intersect with the currently visible ids at render time so
  // a filter change implicitly drops orphans without an effect.
  const [rawSelectedIds, setRawSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  const visibleIds = React.useMemo(
    () => new Set(data.map((d) => d.id)),
    [data],
  );

  const effectiveSelectedIds = React.useMemo(() => {
    const out = new Set<string>();
    for (const id of rawSelectedIds) {
      if (visibleIds.has(id)) out.add(id);
    }
    return out;
  }, [rawSelectedIds, visibleIds]);

  const toggleOne = React.useCallback((id: string, checked: boolean) => {
    setRawSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const toggleAllVisible = React.useCallback(
    (checked: boolean) => {
      setRawSelectedIds((prev) => {
        const next = new Set(prev);
        for (const t of data) {
          if (checked) next.add(t.id);
          else next.delete(t.id);
        }
        return next;
      });
    },
    [data],
  );

  const clearSelection = React.useCallback(
    () => setRawSelectedIds(new Set()),
    [],
  );

  const allVisibleSelected =
    data.length > 0 && data.every((d) => effectiveSelectedIds.has(d.id));
  const someVisibleSelected =
    !allVisibleSelected &&
    data.some((d) => effectiveSelectedIds.has(d.id));

  const selectedRows = React.useMemo(
    () => data.filter((d) => effectiveSelectedIds.has(d.id)),
    [data, effectiveSelectedIds],
  );

  return (
    <div className="space-y-2">
      {selectedRows.length > 0 ? (
        <BulkActionBar selected={selectedRows} onClear={clearSelection} />
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="si-micro w-10 py-2 uppercase tracking-wider text-muted-foreground">
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Select all visible transforms"
                />
              </TableHead>
              <TableHead className="si-micro w-[55%] py-2 uppercase tracking-wider text-muted-foreground">
                Name
              </TableHead>
              {grouped ? null : (
                // Flat layout keeps the per-row Type column. In the
                // grouped layout the column is omitted because the
                // group header already names the type (Q4 of the ADR).
                <TableHead className="si-micro py-2 uppercase tracking-wider text-muted-foreground">
                  Type
                </TableHead>
              )}
              <TableHead className="si-micro w-20 py-2 text-right uppercase tracking-wider text-muted-foreground">
                Usages
              </TableHead>
              <TableHead className="si-micro w-32 py-2 uppercase tracking-wider text-muted-foreground">
                Last modified
              </TableHead>
              <TableHead className="si-micro w-10 py-2 uppercase tracking-wider text-muted-foreground" />
            </TableRow>
          </TableHeader>

          {data.length === 0 ? (
            <tbody>
              <TableRow>
                <TableCell
                  colSpan={numColumns}
                  className="h-16 si-body text-center text-muted-foreground"
                >
                  No transforms in this view.
                </TableCell>
              </TableRow>
            </tbody>
          ) : grouped ? (
            groups.map((group) => {
              const closed = closedSet.has(group.type);
              return (
                <tbody key={group.type}>
                  <GroupHeaderRow
                    type={group.type}
                    count={group.count}
                    closed={closed}
                    numColumns={numColumns}
                    onToggle={(nextClosed) =>
                      toggleGroupClosed(group.type, nextClosed)
                    }
                  />
                  {!closed
                    ? group.transforms.map((t) => (
                        <TransformRow
                          key={t.id}
                          transform={t}
                          href={selectHref(t.id)}
                          selected={effectiveSelectedIds.has(t.id)}
                          onSelectedChange={(c) => toggleOne(t.id, c)}
                          onNavigate={() => router.push(selectHref(t.id))}
                          tenantTransformNames={tenantTransformNames}
                          usagesEntries={usagesByName?.get(t.name)}
                          issuesCounts={issuesByTransformId?.get(t.id)}
                          showTypeCell={false}
                        />
                      ))
                    : null}
                </tbody>
              );
            })
          ) : (
            <tbody>
              {data.map((t) => (
                <TransformRow
                  key={t.id}
                  transform={t}
                  href={selectHref(t.id)}
                  selected={effectiveSelectedIds.has(t.id)}
                  onSelectedChange={(c) => toggleOne(t.id, c)}
                  onNavigate={() => router.push(selectHref(t.id))}
                  tenantTransformNames={tenantTransformNames}
                  usagesEntries={usagesByName?.get(t.name)}
                  issuesCounts={issuesByTransformId?.get(t.id)}
                  showTypeCell
                />
              ))}
            </tbody>
          )}
        </Table>
      </div>
    </div>
  );
}

function GroupHeaderRow({
  type,
  count,
  closed,
  numColumns,
  onToggle,
}: {
  type: string;
  count: number;
  closed: boolean;
  numColumns: number;
  onToggle: (nextClosed: boolean) => void;
}) {
  // The "unknown" bucket is a defensive fallback for transforms with no
  // root `type` — render it neutrally to flag the abnormality without
  // dressing it up as a real ISC type.
  const isUnknown = type === "unknown";
  return (
    <tr
      // Sticky header — stays visible while scrolling within the group.
      // `top: 0` works against the nearest scroll ancestor; on this page
      // the document scrolls, so the header pins to the viewport top.
      className="sticky top-0 z-[5] bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-b border-border"
    >
      <td
        colSpan={numColumns}
        className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground"
      >
        <button
          type="button"
          onClick={() => onToggle(!closed)}
          aria-expanded={!closed}
          aria-controls={`group-${type}`}
          className="flex w-full items-center gap-2 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform",
              closed && "-rotate-90",
            )}
            aria-hidden
          />
          {/* Type icon mirrors the per-row glyph used in the Name cell —
              same visual key whether the user scans the header or a
              row. */}
          <TypeIcon type={type} />
          <Pill
            tone={isUnknown ? "neutral" : "accent"}
            mono={!isUnknown}
            className="normal-case"
          >
            {type}
          </Pill>
          <span className="normal-case font-normal text-muted-foreground/80">
            · {count} {count === 1 ? "transform" : "transforms"}
          </span>
        </button>
      </td>
    </tr>
  );
}

function TransformRow({
  transform,
  href,
  selected,
  onSelectedChange,
  onNavigate,
  tenantTransformNames,
  usagesEntries,
  issuesCounts,
  showTypeCell,
}: {
  transform: SelectableTransform;
  href: string;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  onNavigate: () => void;
  tenantTransformNames: ReadonlyArray<string>;
  /** Per-kind breakdown for this transform — fed to the Usages cell tooltip. */
  usagesEntries?: ReadonlyArray<UsageEntry>;
  /** Lint counts for this transform — drives the inline issues badge.
   * `undefined` = no issues (badge stays hidden). */
  issuesCounts?: IssuesBadgeCounts;
  /**
   * Render the per-row Type cell. True in the flat layout (Type column
   * present), false in the grouped layout (header carries the type).
   */
  showTypeCell: boolean;
}) {
  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className={cn(
        "cursor-pointer hover:bg-[var(--si-row-hover)]",
        selected && "bg-accent/40 hover:bg-accent/40",
      )}
      onClick={onNavigate}
    >
      <TableCell className="w-10 py-2">
        <span
          className="inline-flex"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onChange={onSelectedChange}
            aria-label={`Select ${transform.name}`}
          />
        </span>
      </TableCell>
      <TableCell className="w-[55%] py-2">
        <a
          href={href}
          onClick={(e) => e.preventDefault()}
          className="flex w-full items-center gap-2 font-mono si-caption"
        >
          <TypeIcon type={transform.type} />
          <span className="truncate">{transform.name}</span>
          {/* Visual order: name → issues badge → origin pill (per ADR /
              issue #310 PR 4/4). Badge is a tooltip-only span so the row
              click still bubbles to the drawer. */}
          <IssuesBadge counts={issuesCounts} />
          <OriginPill internal={transform.internal} />
        </a>
      </TableCell>
      {showTypeCell ? (
        <TableCell className="py-2">
          <TypePill type={transform.type} />
        </TableCell>
      ) : null}
      <TableCell className="w-20 py-2 text-right">
        <span
          className="inline-flex"
          onClick={(e) => e.stopPropagation()}
        >
          <UsagesCell
            usages={transform.usages}
            internal={transform.internal}
            transformId={transform.id}
            usagesEntries={usagesEntries}
          />
        </span>
      </TableCell>
      <TableCell className="w-32 py-2">
        <LastModifiedCell value={transform.modified} />
      </TableCell>
      <TableCell className="w-10 py-2">
        <span
          className="inline-flex"
          onClick={(e) => e.stopPropagation()}
        >
          <RowActions
            id={transform.id}
            name={transform.name}
            usages={transform.usages}
            internal={transform.internal}
            tenantTransformNames={tenantTransformNames}
          />
        </span>
      </TableCell>
    </TableRow>
  );
}
