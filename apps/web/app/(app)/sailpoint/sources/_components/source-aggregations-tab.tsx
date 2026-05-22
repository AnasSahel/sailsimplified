import { Info } from "lucide-react";

import { FilterBar } from "@/components/ui/filter-bar";
import { StateView } from "@/components/ui/state-view";
import type {
  AggregationRun,
  AggregationRunStatus,
  AggregationRunTrigger,
} from "@/lib/sailpoint/sources-api";
import { cn } from "@/lib/utils";

import { AggregationRangeFilter } from "./aggregation-range-filter";
import { AggregationRunsStatusFilter } from "./aggregation-runs-status-filter";
import { AggregationRunsView } from "./aggregation-runs-view";
import { AggregationTriggerFilter } from "./aggregation-trigger-filter";
import { AggregationsRefreshButton } from "./aggregations-refresh-button";
import type { RangeValue } from "./aggregations-shared";

/**
 * `<SourceAggregationsTab>` (issue #268) — Aggregations tab on the source
 * detail page.
 *
 * Server Component — composition only. Receives the runs array pre-fetched
 * by the page via `listAggregationRuns(userId, …)`. Filters live in the URL
 * (`?runrange`, `?runstatus`, `?runtrigger`, `?runpage`); validation lives
 * in `aggregations-shared.ts`.
 *
 * Banner trigger: when every run in the response is `origin: "events"`,
 * we infer the tenant is in the sync-jobs fallback mode and surface a
 * subtle muted banner explaining the degradation. The runs array can be
 * empty in stub mode — the banner stays hidden and the empty state fires.
 */
export function SourceAggregationsTab({
  sourceId,
  runs,
  range,
  status,
  trigger,
  page,
  clearFiltersHref,
  hasAnyFilter,
  pageHrefFor,
}: {
  sourceId: string;
  runs: ReadonlyArray<AggregationRun>;
  range: RangeValue;
  status: AggregationRunStatus | null;
  trigger: AggregationRunTrigger | null;
  page: number;
  clearFiltersHref: string;
  hasAnyFilter: boolean;
  pageHrefFor: (page: number) => string;
}) {
  // Fallback-mode detection. ISC tenants that disable the `sync-jobs`
  // surface (older clusters, restricted scopes) fall back to the events
  // index, which loses the per-run duration + stats. We render a banner
  // when *every* run we got back is from that fallback path — the chart
  // is still useful for cadence but the bars degrade to the minimum
  // height (the durationSec is unset).
  const allFromEvents =
    runs.length > 0 && runs.every((r) => r.origin === "events");

  return (
    <div className="space-y-4">
      {allFromEvents ? <FallbackBanner /> : null}

      <FilterBar
        filters={
          <>
            <AggregationRangeFilter selected={range} />
            <AggregationRunsStatusFilter selected={status} />
            <AggregationTriggerFilter selected={trigger} />
          </>
        }
        clearHref={hasAnyFilter ? clearFiltersHref : undefined}
        trailing={<AggregationsRefreshButton sourceId={sourceId} />}
      />

      {runs.length === 0 ? (
        <StateView
          intent="empty"
          size="sm"
          title={
            hasAnyFilter
              ? "No aggregation runs match the current filters."
              : "No aggregation has run on this source yet."
          }
          description={
            hasAnyFilter
              ? "Try widening the time range or clearing the status / trigger filter."
              : "Once SailPoint runs an aggregation on this source, it will appear here."
          }
          action={null}
        />
      ) : (
        <AggregationRunsView
          runs={runs}
          page={page}
          pageHrefFor={pageHrefFor}
        />
      )}
    </div>
  );
}

function FallbackBanner() {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        "bg-muted/40 border-border",
      )}
    >
      <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="si-body text-foreground">
          Aggregation run details degraded — chart / duration unavailable.
        </p>
        <p className="si-caption text-muted-foreground">
          ISC&apos;s events index is the fallback for this tenant.
          Per-run duration and stats aren&apos;t exposed in that mode.
        </p>
      </div>
    </div>
  );
}
