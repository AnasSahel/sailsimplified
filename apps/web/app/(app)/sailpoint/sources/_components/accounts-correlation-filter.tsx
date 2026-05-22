"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import { ACCOUNT_CORRELATION_OPTIONS } from "./accounts-filters-shared";

/**
 * Single-select correlation filter for the Accounts tab.
 *
 * URL contract: `?accorphan=correlated|orphan`. The server-side page
 * translates to `filters=uncorrelated eq false|true` against ISC.
 */
export function AccountsCorrelationFilter({
  selected,
}: {
  selected: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Correlation"
      value={selected}
      options={
        ACCOUNT_CORRELATION_OPTIONS as unknown as {
          value: string;
          label: string;
        }[]
      }
      clearLabel="Any"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("accpage");
        if (value) params.set("accorphan", value);
        else params.delete("accorphan");
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
      }}
    />
  );
}
