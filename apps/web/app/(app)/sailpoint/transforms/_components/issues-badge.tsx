"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  type IssuesBadgeCounts,
  summariseIssuesByTransformId,
} from "./issues-badge-shared";

/**
 * `<IssuesBadge>` — small dot rendered inline next to a transform name
 * when the lint scan flagged at least one issue against that transform
 * (#310 PR 4/4).
 *
 * Visual rules (cf. ADR §Recommandation détaillée):
 *   - 0 errors + 0 warnings → render nothing (caller can also skip render).
 *   - errors > 0            → red rose-500 dot (errors win over warnings).
 *   - errors === 0 && warnings > 0 → amber dot.
 *
 * Tooltip: `<n> error(s) · <n> warning(s)` (singular when 1).
 *
 * Click handling: NONE on the badge itself — the parent row already
 * owns the click → drawer behavior, and the badge sits inside the row's
 * click target (no `e.stopPropagation`). The tooltip trigger is a plain
 * `<span>` (not a Link) so it doesn't compete with the row navigation.
 *
 * The sidebar layout already provides a `<TooltipProvider>`, so callers
 * don't need to wrap us — same convention as `<UsagesCell>`.
 */

export function IssuesBadge({
  counts,
  className,
}: {
  counts: IssuesBadgeCounts | undefined;
  className?: string;
}) {
  if (!counts || (counts.errors === 0 && counts.warnings === 0)) return null;

  const isError = counts.errors > 0;
  // Error wins over warnings — see ADR. The dot tone follows.
  const dotClass = isError
    ? "bg-rose-500"
    : "bg-amber-500";

  const errorWord = counts.errors === 1 ? "error" : "errors";
  const warningWord = counts.warnings === 1 ? "warning" : "warnings";
  const tooltipText = `${counts.errors} ${errorWord} · ${counts.warnings} ${warningWord}`;

  // Aria-label mirrors the tooltip text so screen readers see the same
  // information as sighted users hovering the dot.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={tooltipText}
          className={cn(
            "inline-flex h-2 w-2 shrink-0 rounded-full",
            dotClass,
            className,
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

// `IssuesBadgeCounts` and `summariseIssuesByTransformId` are now
// re-exported from `./issues-badge-shared` so server components
// can use them too. See top-of-file imports.
export { type IssuesBadgeCounts, summariseIssuesByTransformId };
