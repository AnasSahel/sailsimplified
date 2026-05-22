"use client";

import { useSearchParams } from "next/navigation";
import { Rows3 } from "lucide-react";

import { FilterDropdown } from "@/components/ui/filter-dropdown";

import {
  type GroupingMode,
  groupingModeFromParam,
} from "./grouping-mode-filter-shared";

/**
 * `<GroupingModeFilter>` — opt-in toggle that turns the flat transforms
 * table into a `transform.type`-grouped view. Default is `None` (flat).
 *
 * Decisions locked by the **Amendment** at the top of ADR
 * `vault/Projects/Simplified Identity/2026-05-14-transforms-list-grouping-by-type.md`:
 *
 *   - Q5 — default is OFF (flat table is the routine experience).
 *   - Q6 — activation is a `Group by` filter chip in the toolbar.
 *   - Q4 — when grouping is OFF, the per-row Type column is visible.
 *
 * URL parameter — `?groupBy=type` when active, omitted when None.
 *
 * Note on the param name: the ADR amendment specifies `?group=type`,
 * but `?group=` is already taken by the legacy "Group" filter chip
 * (`group-filter.tsx`) which carries `TransformGroupSlug` values
 * (`format`, `string-ops`, ...). To keep the two chips strictly
 * orthogonal, this new chip uses the distinct `?groupBy=` namespace.
 *
 * Side-effect on toggle off: any leftover `?groups.<type>=closed`
 * params from the grouped state are also stripped — without grouping
 * those collapse markers refer to nothing and should not pollute the URL.
 */

export function GroupingModeFilter({ selected }: { selected: GroupingMode }) {
  const searchParams = useSearchParams();

  return (
    <FilterDropdown
      label="Group by"
      value={selected}
      options={[{ value: "type", label: "Type" }]}
      icon={<Rows3 className="h-3.5 w-3.5" />}
      clearLabel="None"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("page");
        if (value) {
          params.set("groupBy", value);
        } else {
          params.delete("groupBy");
          // Strip stale per-group collapse markers — they are only
          // meaningful when grouping is active.
          for (const key of Array.from(params.keys())) {
            if (key.startsWith("groups.")) {
              params.delete(key);
            }
          }
        }
        const qs = params.toString();
        return qs ? `/sailpoint/transforms?${qs}` : "/sailpoint/transforms";
      }}
    />
  );
}

// `GroupingMode` and `groupingModeFromParam` re-exported from
// `./grouping-mode-filter-shared` so server components can use them too.
export { type GroupingMode, groupingModeFromParam };
