"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import { ACCOUNT_REFRESH_OPTIONS } from "./accounts-filters-shared";

/**
 * Single-select "Last refresh" range filter for the Accounts tab.
 *
 * URL contract: `?accrefresh=24h|7d|30d|older`. The server-side page
 * translates to a `modified gt|le` clause against ISC using a
 * computed cutoff timestamp.
 */
export function AccountsRefreshFilter({
  selected,
}: {
  selected: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Last refresh"
      value={selected}
      options={
        ACCOUNT_REFRESH_OPTIONS as unknown as { value: string; label: string }[]
      }
      clearLabel="Any time"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("accpage");
        if (value) params.set("accrefresh", value);
        else params.delete("accrefresh");
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
      }}
    />
  );
}
