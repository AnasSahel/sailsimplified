"use client";

import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import {
  type IssuesFilterValue,
  issuesFromParam,
} from "./issues-filter-shared";

/**
 * Binary filter on the transforms list: "Has issues" (≥ 1 lint finding,
 * any severity) or "All". Backed by `?issues=1`. Final piece of issue
 * #310 (PR 4/4) — pairs with the inline row badges and the Issues KPI
 * card to give the lint surface a 1-click drill-down.
 *
 * Kept binary in v1 — same shape as `<UsagesFilter>` (PR 2 of #310). A
 * future widening to "errors only / warnings only / specific rule" can
 * re-use the same chip slot and the same `?issues=` param namespace
 * without an URL contract change.
 */

const NON_DEFAULT_OPTIONS: { value: "has-issues"; label: string }[] = [
  { value: "has-issues", label: "Has issues" },
];

export function IssuesFilter({ selected }: { selected: IssuesFilterValue }) {
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Issues"
      value={selected === "all" ? null : selected}
      options={NON_DEFAULT_OPTIONS}
      icon={<AlertTriangle className="h-3.5 w-3.5" />}
      clearLabel="All"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("page");
        // URL contract: `?issues=1` is the "has-issues" state. Reserve
        // numeric literals for a future severity widening (`?issues=2`,
        // …) without breaking existing bookmarks.
        if (value === "has-issues") params.set("issues", "1");
        else params.delete("issues");
        const qs = params.toString();
        return qs ? `/sailpoint/transforms?${qs}` : "/sailpoint/transforms";
      }}
    />
  );
}

// Re-export shared types so consumers that already import `IssuesFilter`
// also get the type without a second import line.
export { type IssuesFilterValue, issuesFromParam };
