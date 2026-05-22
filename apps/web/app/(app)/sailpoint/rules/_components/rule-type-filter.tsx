"use client";

import { useSearchParams } from "next/navigation";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

/**
 * Type filter for the Rules list — mirrors the transforms `TypeFilter`.
 * Options are the connector-rule types present in the current tenant
 * inventory (computed server-side, passed in).
 */
export function RuleTypeFilter({
  availableTypes,
  selected,
}: {
  availableTypes: string[];
  selected: string | null;
}) {
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Type"
      value={selected}
      options={availableTypes.map((t) => ({ value: t, label: t }))}
      clearLabel="All types"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("page");
        if (value) params.set("type", value);
        else params.delete("type");
        const qs = params.toString();
        return qs ? `/sailpoint/rules?${qs}` : "/sailpoint/rules";
      }}
    />
  );
}
