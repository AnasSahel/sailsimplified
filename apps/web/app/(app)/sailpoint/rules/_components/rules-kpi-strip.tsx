import { AlertTriangle, CheckCircle2, EyeOff, LayoutGrid, List } from "lucide-react";

import { StatCell, type StatItem } from "@/components/ui/stat-group";

/**
 * KPI strip above the Rules toolbar (#344): Total / By type / Attached /
 * Unattached. All four cards are server-rendered from the same
 * `/v2025/connector-rules` + sources payload the table consumes — no extra
 * SailPoint call. Counts reflect the *visible* (post-filter) set so the
 * numbers move with the user's filtering, matching the transforms strip.
 *
 * Layout matches `TransformsKpiStrip` — inline `<StatCell>`s in one
 * rounded card with `sm:divide-x` separators.
 */
export type RulesKpis = {
  total: number;
  /** Number of distinct connector-rule types present in the visible set. */
  typeCount: number;
  attachedCount: number;
  unattachedCount: number;
  /**
   * `false` when the attachment roll-up couldn't be computed (sources
   * fan-out failed). The Attached / Unattached cards then render "—".
   */
  usagesAvailable: boolean;
  /** Source-lint findings across the visible set (#364). */
  issueErrorCount: number;
  issueWarningCount: number;
  rulesWithIssues: number;
};

export function RulesKpiStrip({ kpis }: { kpis: RulesKpis }) {
  const items: StatItem[] = [
    {
      label: "Total rules",
      value: kpis.total.toLocaleString(),
      icon: <List className="h-4 w-4" />,
      sub:
        kpis.total > 0
          ? `${kpis.typeCount} ${kpis.typeCount === 1 ? "type" : "types"}`
          : "No connector rules defined",
    },
    {
      label: "By type",
      tooltip:
        "Distinct connector-rule types in this view (BuildMap, BeforeProvisioning, correlation, …).",
      value: kpis.typeCount.toLocaleString(),
      icon: <LayoutGrid className="h-4 w-4" />,
      sub: "Distinct rule types",
    },
    {
      label: "Attached",
      tooltip:
        "Connector rules referenced by at least one source. These execute during aggregation or provisioning.",
      value: kpis.usagesAvailable ? kpis.attachedCount.toLocaleString() : "—",
      icon: <CheckCircle2 className="h-4 w-4" />,
      sub: kpis.usagesAvailable ? "Referenced by ≥1 source" : "Usages unavailable",
    },
    {
      label: "Unattached",
      tooltip:
        "Connector rules no source references. They never execute — likely safe to archive, or a source wiring was missed.",
      value: kpis.usagesAvailable ? kpis.unattachedCount.toLocaleString() : "—",
      tone: "warning",
      icon: <EyeOff className="h-4 w-4" />,
      sub: !kpis.usagesAvailable
        ? "Usages unavailable"
        : kpis.unattachedCount > 0
          ? "Review unattached rules →"
          : "Nothing flagged",
      href:
        kpis.usagesAvailable && kpis.unattachedCount > 0
          ? "/sailpoint/rules?attached=0"
          : undefined,
    },
    {
      label: "Issues",
      tooltip:
        "Source-hygiene findings across the visible rules (deprecated ISC calls, null-safety, API-in-loop, dead code, hardcoded secrets). Errors block; warnings inform.",
      value: (kpis.issueErrorCount + kpis.issueWarningCount).toLocaleString(),
      tone: kpis.issueErrorCount > 0 ? "danger" : undefined,
      icon: <AlertTriangle className="h-4 w-4" />,
      sub:
        kpis.issueErrorCount + kpis.issueWarningCount > 0
          ? `${kpis.issueErrorCount.toLocaleString()} errors · ${kpis.issueWarningCount.toLocaleString()} warnings`
          : "No source issues",
      href: kpis.rulesWithIssues > 0 ? "/sailpoint/rules?issues=1" : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:flex sm:gap-0 sm:rounded-lg sm:border sm:bg-card sm:divide-x">
      {items.map((item, idx) => (
        <StatCell key={idx} item={item} layout="inline" />
      ))}
    </div>
  );
}
