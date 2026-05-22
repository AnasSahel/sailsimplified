"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import { ACCOUNT_STATUS_OPTIONS } from "./accounts-filters-shared";

/**
 * Single-select status filter for the Accounts tab.
 *
 * URL contract: `?accstatus=enabled|disabled`. The server-side page
 * translates to `filters=disabled eq false|true` against ISC.
 */
export function AccountsStatusFilter({
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
        ACCOUNT_STATUS_OPTIONS as unknown as { value: string; label: string }[]
      }
      clearLabel="Any status"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("accpage");
        if (value) params.set("accstatus", value);
        else params.delete("accstatus");
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
      }}
    />
  );
}
