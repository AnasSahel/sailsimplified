import Link from "next/link";

import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { StateView } from "@/components/ui/state-view";
import type { ListSourceActivityResult } from "@/lib/sailpoint/sources-api";

import { ActivityActionFilter } from "./activity-action-filter";
import { ActivityActorFilter } from "./activity-actor-filter";
import { ActivityRangeFilter } from "./activity-range-filter";
import { ActivityRefreshButton } from "./activity-refresh-button";
import { ActivitySearchBox } from "./activity-search-box";
import { ActivityTimelineRow } from "./activity-timeline-row";
import { ACTIVITY_DEFAULT_LIMIT } from "./activity-filters-shared";

/**
 * `<SourceActivityTab>` (issue #270) — Activity tab on the source
 * detail page. Server Component — composition only.
 *
 * Renders:
 *  1. Retention hint banner when ISC truncated the upstream window.
 *  2. Filter bar: search · actor · action · range · refresh.
 *  3. Vertical timeline (one row per `ActivityEntry`).
 *  4. Pagination ("Load more" cursor emulation via `actoffset`).
 *
 * Each row delegates to `<ActivityTimelineRow>` (client island for the
 * diff toggle + tooltip). The diff render itself lives in
 * `<ActivityInlineDiff>` — see ADR `2026-05-14-sources-activity-audit-shape`
 * for the strategy (per-key compare, JSON fallback for nested).
 *
 * Stub-mode behaviour: when `listSourceActivity` returns
 * `{ entries: [] }` (current state until #271 lands the real impl), the
 * empty state renders unchanged.
 *
 * Pagination is "Load more" only — no Prev/Next paginator. The user can
 * load up to `ACTIVITY_DEFAULT_LIMIT` entries per click; on each click
 * we increment `actoffset`. This matches the chunked-render approach of
 * the schema attributes "+N more" affordance (issue #264) — no
 * virtualisation lib in the repo.
 */
export function SourceActivityTab({
  result,
  filters,
  basePath,
  hasAnyFilter,
  clearFiltersHref,
  loadMoreHref,
  currentTotal,
}: {
  result: ListSourceActivityResult;
  filters: {
    q: string;
    actor: string | null;
    action: string | null;
    range: string | null;
  };
  basePath: string;
  hasAnyFilter: boolean;
  clearFiltersHref: string;
  /** When non-null, a "Load more" link bumps `actoffset` by the page size. */
  loadMoreHref: string | null;
  /** How many entries we asked for (limit). Drives the "Load more" affordance. */
  currentTotal: number;
}) {
  const entries = result.entries;
  const retentionHint = result.iscRetentionHint?.approximateOldestAvailable;

  return (
    <div className="space-y-4">
      {retentionHint && (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 si-caption text-muted-foreground">
          ISC events older than ~30 days are not displayed. Oldest available:{" "}
          {new Date(retentionHint).toLocaleDateString(undefined, {
            dateStyle: "medium",
          })}
          . App-side audit is retained indefinitely.
        </div>
      )}

      <FilterBar
        search={<ActivitySearchBox initial={filters.q} />}
        clearHref={hasAnyFilter ? clearFiltersHref : undefined}
        filters={
          <>
            <ActivityActorFilter selected={filters.actor} />
            <ActivityActionFilter selected={filters.action} />
            <ActivityRangeFilter selected={filters.range} />
          </>
        }
        trailing={<ActivityRefreshButton />}
      />

      {entries.length === 0 ? (
        <StateView
          intent="empty"
          size="sm"
          title="No activity recorded for this source in the selected range."
          description={
            hasAnyFilter
              ? "Adjust the filters to widen the time window or change the actor/action."
              : "Once admins start managing this source from the app, every action will appear here. ISC-side events show up as soon as the source is active."
          }
        />
      ) : (
        <>
          <ol
            role="list"
            aria-label="Source activity timeline"
            className="space-y-0"
          >
            {entries.map((entry, idx) => (
              <ActivityTimelineRow
                key={`${entry.origin}-${entry.id}`}
                entry={entry}
                isLast={idx === entries.length - 1}
              />
            ))}
          </ol>
          <div className="flex items-center justify-between si-caption text-muted-foreground">
            <span>
              Showing {entries.length} entr{entries.length === 1 ? "y" : "ies"}
              {currentTotal > ACTIVITY_DEFAULT_LIMIT
                ? ` (limit ${currentTotal})`
                : ""}
              .
            </span>
            {loadMoreHref && (
              <Button variant="outline" size="sm" asChild>
                <Link href={loadMoreHref} scroll={false}>
                  Load more
                </Link>
              </Button>
            )}
          </div>
        </>
      )}
      <ActivityTabFootnote basePath={basePath} />
    </div>
  );
}

/**
 * Subtle footnote at the bottom of the timeline. Kept distinct from the
 * retention banner so it always renders, even when ISC isn't truncating.
 * Reminds the admin that the app-side audit is the durable record.
 */
function ActivityTabFootnote({ basePath: _basePath }: { basePath: string }) {
  return (
    <p className="si-caption text-muted-foreground/80">
      Combined timeline: ISC events index (retention ≈ 30 days) + app-side
      audit log (retained indefinitely).
    </p>
  );
}
