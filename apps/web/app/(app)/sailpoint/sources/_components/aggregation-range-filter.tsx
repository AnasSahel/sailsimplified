"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import {
  AGGREGATION_RANGE_OPTIONS,
  DEFAULT_RANGE,
  type RangeValue,
} from "./aggregations-shared";

/**
 * Time-range filter for the Aggregations tab. Single-select, URL-driven.
 *
 * URL contract: `?runrange=24h|7d|30d|90d`. Omitted = `30d`. Picking the
 * default explicitly removes the param so the URL stays clean.
 */
export function AggregationRangeFilter({
  selected,
}: {
  selected: RangeValue;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The dropdown renders an explicit "no value" entry above the option
  // list — we'd rather always show a value, so we never surface
  // `null`. The dropdown still calls `hrefFor(null)` if the user picks
  // the implicit clear, which we treat as "go back to default".
  const value: string | null =
    selected === DEFAULT_RANGE ? null : selected;

  return (
    <FilterDropdown
      label="Range"
      value={value}
      options={
        AGGREGATION_RANGE_OPTIONS as unknown as {
          value: string;
          label: string;
        }[]
      }
      clearLabel={
        AGGREGATION_RANGE_OPTIONS.find((o) => o.value === DEFAULT_RANGE)
          ?.label ?? "Last 30 days"
      }
      hrefFor={(v) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("runpage");
        if (v && v !== DEFAULT_RANGE) params.set("runrange", v);
        else params.delete("runrange");
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
      }}
    />
  );
}
