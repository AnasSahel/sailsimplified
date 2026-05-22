import { CheckCircle2, EyeOff, List } from "lucide-react";

import { StatCell, type StatItem } from "@/components/ui/stat-group";

import { IssuesKpiCard } from "./issues-kpi-card";

/**
 * KPI strip rendered above the toolbar on the Transforms list.
 *
 * The first three cards (Total / In use / Unused) are server-rendered
 * from the same `/v2025/transforms` payload the table consumes — no
 * extra SailPoint call. Counts reflect the *visible* (post-filter) set
 * so the numbers move with the user's filtering, in the same way the
 * Identity attributes drift card moves with its scope.
 *
 * The fourth card (Issues, #310) is a client island that fetches
 * `/api/sailpoint/transforms/lint` on its own. We render it inside the
 * same flex wrapper as the server cells so the strip stays one rounded
 * card with `sm:divide-x` separators across all four cells. Using a
 * single wrapper means dividers align perfectly — splitting the strip
 * into "server StatGroup + client island" would visually break the row.
 *
 * Layout matches the Identity attributes header (#205) — `inline`
 * `<StatCell>`s with `divide-x` separators, prominent number, uppercase
 * eyebrow label, action icon top-right per cell — so the page-top
 * surface reads as one continuous design language across listings.
 */
export type TransformsKpis = {
  total: number;
  builtinCount: number;
  customCount: number;
  inUseCount: number;
  unusedCount: number;
  /**
   * `false` when the usages roll-up couldn't be computed (identity
   * profiles + sources fan-out all timed out). Cards 2 and 3 then
   * render "—" with a "Usages unavailable" sub-line, matching the
   * "Coming soon" graceful-degradation pattern of the Identity
   * attributes strip.
   */
  usagesAvailable: boolean;
};

export function TransformsKpiStrip({ kpis }: { kpis: TransformsKpis }) {
  const items: StatItem[] = [
    {
      label: "Total transforms",
      value: kpis.total.toLocaleString(),
      icon: <List className="h-4 w-4" />,
      sub:
        kpis.total > 0
          ? `${kpis.builtinCount.toLocaleString()} built-in · ${kpis.customCount.toLocaleString()} custom`
          : "No transforms defined",
    },
    {
      label: "In use",
      tooltip:
        "Transforms referenced by at least one identity attribute or source provisioning policy on the connected tenant.",
      value: kpis.usagesAvailable ? kpis.inUseCount.toLocaleString() : "—",
      icon: <CheckCircle2 className="h-4 w-4" />,
      sub: kpis.usagesAvailable
        ? "Referenced in attributes & sources"
        : "Usages unavailable",
    },
    {
      label: "Unused",
      tooltip:
        "Transforms not referenced by any identity attribute or source provisioning policy. Safe to delete — pollutes the list and search elsewhere.",
      value: kpis.usagesAvailable ? kpis.unusedCount.toLocaleString() : "—",
      tone: "warning",
      icon: <EyeOff className="h-4 w-4" />,
      sub: !kpis.usagesAvailable
        ? "Usages unavailable"
        : kpis.unusedCount > 0
          ? "Review unused transforms →"
          : "Nothing flagged",
      // Clickable only when the count is real and non-zero — a "0"
      // card linking to itself would be a dead-end. The link lands
      // on `?usages=0`, which the page parses into the binary
      // `UsagesFilter` chip (active state) and narrows the table.
      href:
        kpis.usagesAvailable && kpis.unusedCount > 0
          ? "/sailpoint/transforms?usages=0"
          : undefined,
    },
  ];

  return (
    // Wrapper class kept in sync with the inline branch of `<StatGroup>`
    // (`components/ui/stat-group.tsx`). If StatGroup's inline classes
    // change, mirror the change here so the strip stays visually
    // consistent with the Identity attributes header.
    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:flex sm:gap-0 sm:rounded-lg sm:border sm:bg-card sm:divide-x">
      {items.map((item, idx) => (
        <StatCell key={idx} item={item} layout="inline" />
      ))}
      <IssuesKpiCard />
    </div>
  );
}
