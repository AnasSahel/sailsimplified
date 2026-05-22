"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import { ACTIVITY_ACTOR_OPTIONS } from "./activity-filters-shared";

/**
 * Single-select actor filter for the Activity tab.
 *
 * URL contract: `?actactor=app-user|isc-system|isc-user|unknown`. The
 * server-side page forwards this verbatim to the factory's
 * `filters.actor` field.
 */
export function ActivityActorFilter({
  selected,
}: {
  selected: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Actor"
      value={selected}
      options={
        ACTIVITY_ACTOR_OPTIONS as unknown as { value: string; label: string }[]
      }
      clearLabel="Any actor"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("actoffset");
        if (value) params.set("actactor", value);
        else params.delete("actactor");
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
      }}
    />
  );
}
