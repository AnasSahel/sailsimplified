"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import { AGGREGATION_TRIGGER_OPTIONS } from "./aggregations-shared";

/**
 * Aggregation-run trigger filter. Single-select, URL-driven.
 *
 * URL contract: `?runtrigger=manual|scheduled|api|unknown`. Omitted = "all".
 */
export function AggregationTriggerFilter({
  selected,
}: {
  selected: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Trigger"
      value={selected}
      options={
        AGGREGATION_TRIGGER_OPTIONS as unknown as {
          value: string;
          label: string;
        }[]
      }
      clearLabel="Any trigger"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("runpage");
        if (value) params.set("runtrigger", value);
        else params.delete("runtrigger");
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
      }}
    />
  );
}
