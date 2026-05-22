"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import { AGGREGATION_STATUS_OPTIONS } from "./aggregations-shared";

/**
 * Aggregation-run status filter. Single-select, URL-driven.
 *
 * URL contract: `?runstatus=success|warning|error|running|terminated`.
 * Omitted = "all".
 *
 * Named `*-runs-status-filter` (not `*-status-filter`) because the file
 * `accounts-status-filter.tsx` already exists and the two filters live
 * side-by-side in the same `_components/` directory.
 */
export function AggregationRunsStatusFilter({
  selected,
}: {
  selected: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Status"
      value={selected}
      options={
        AGGREGATION_STATUS_OPTIONS as unknown as {
          value: string;
          label: string;
        }[]
      }
      clearLabel="Any status"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("runpage");
        if (value) params.set("runstatus", value);
        else params.delete("runstatus");
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
      }}
    />
  );
}
