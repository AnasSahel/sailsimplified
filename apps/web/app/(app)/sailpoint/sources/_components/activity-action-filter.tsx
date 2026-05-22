"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import { ACTIVITY_ACTION_OPTIONS } from "./activity-filters-shared";

/**
 * Single-select action-type filter for the Activity tab.
 *
 * URL contract: `?actaction=<action-key>`. The page forwards the raw
 * string to `filters.actionType`; the factory matches it against either
 * origin's `action` field (app-side: enum constant, ISC-side: event
 * action name).
 *
 * The dropdown lists a curated whitelist (per ADR D1 — 10 app actions +
 * most common ISC events). Users with rarer ISC actions in their stream
 * see them in the timeline rows but can't yet filter by them; that's an
 * accepted v0 limitation.
 */
export function ActivityActionFilter({
  selected,
}: {
  selected: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Action"
      value={selected}
      options={
        ACTIVITY_ACTION_OPTIONS as unknown as {
          value: string;
          label: string;
        }[]
      }
      clearLabel="Any action"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("actoffset");
        if (value) params.set("actaction", value);
        else params.delete("actaction");
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
      }}
    />
  );
}
