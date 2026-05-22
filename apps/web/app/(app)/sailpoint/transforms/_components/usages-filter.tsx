"use client";

import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

/**
 * Binary filter on the transforms list: "Unused" (= zero usages) or
 * "All". Backed by `?usages=0`. The full multi-value filter (any /
 * exact / range) is deferred to #315 — this minimal shape exists today
 * so the KPI strip's "Review unused transforms →" CTA (#312) can drive
 * the table without a no-op link.
 *
 * Kept as its own filter rather than overloading `internal`/`group`
 * because (a) the param is conceptually orthogonal and (b) #315 will
 * grow it into its own dropdown without a URL contract change.
 */
export type UsagesFilterValue = "all" | "unused";

const NON_DEFAULT_OPTIONS: { value: "unused"; label: string }[] = [
  { value: "unused", label: "Unused (0)" },
];

export function UsagesFilter({ selected }: { selected: UsagesFilterValue }) {
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Usages"
      value={selected === "all" ? null : selected}
      options={NON_DEFAULT_OPTIONS}
      icon={<AlertCircle className="h-3.5 w-3.5" />}
      clearLabel="Any"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("page");
        // URL contract: `?usages=0` is the "unused" state. We don't
        // serialize the enum literal because #315 will widen the param
        // to numeric values (`?usages=1`, `?usages=5+`, etc.) and we
        // want the URL shape stable from day one.
        if (value === "unused") params.set("usages", "0");
        else params.delete("usages");
        const qs = params.toString();
        return qs ? `/sailpoint/transforms?${qs}` : "/sailpoint/transforms";
      }}
    />
  );
}
