"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import { ACTIVITY_RANGE_OPTIONS } from "./activity-filters-shared";

/**
 * Single-select date-range filter for the Activity tab.
 *
 * URL contract: `?actrange=24h|7d|30d|90d|all`. The server page maps the
 * bucket to a `filters.from` ISO cutoff (omitted on `all`).
 */
export function ActivityRangeFilter({
  selected,
}: {
  selected: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Range"
      value={selected}
      options={
        ACTIVITY_RANGE_OPTIONS as unknown as {
          value: string;
          label: string;
        }[]
      }
      clearLabel="Any range"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("actoffset");
        if (value) params.set("actrange", value);
        else params.delete("actrange");
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
      }}
    />
  );
}
