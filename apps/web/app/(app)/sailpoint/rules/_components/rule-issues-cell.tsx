"use client";

import Link from "next/link";

import { Pill } from "@/components/ui/pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RuleIssueCount } from "./source-issues";

/**
 * Per-row source-hygiene signal on the rules list (#364).
 *
 * Tone mirrors the IDE/linter vocabulary used everywhere else in the app:
 *   - any error → `danger` (rose), value = total findings
 *   - warnings only → `warning` (amber)
 *   - clean (absent from the counts map) → muted `—`
 *
 * Clicking links to the rule detail page where findings are listed with
 * fix-in-editor links — so the list signal and detail share one entry point.
 */
export function RuleIssuesCell({
  ruleId,
  count,
  className,
}: {
  ruleId: string;
  count: RuleIssueCount | undefined;
  className?: string;
}) {
  const href = `/sailpoint/rules/${encodeURIComponent(ruleId)}`;

  if (!count || (count.errorCount === 0 && count.warningCount === 0)) {
    return (
      <span className={className}>
        <span className="text-muted-foreground/40">—</span>
      </span>
    );
  }

  const total = count.errorCount + count.warningCount;
  const tone: "danger" | "warning" = count.errorCount > 0 ? "danger" : "warning";
  const parts: string[] = [];
  if (count.errorCount > 0) parts.push(`${count.errorCount} error${count.errorCount === 1 ? "" : "s"}`);
  if (count.warningCount > 0) parts.push(`${count.warningCount} warning${count.warningCount === 1 ? "" : "s"}`);
  const tooltipText = parts.join(" · ");

  return (
    <span className={className}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={`${tooltipText} — open rule`}
          >
            <Pill tone={tone} dot mono className="cursor-pointer">
              {total}
            </Pill>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
