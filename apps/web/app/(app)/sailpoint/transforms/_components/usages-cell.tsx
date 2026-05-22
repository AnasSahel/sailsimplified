"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Pill } from "@/components/ui/pill";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { UsageEntry } from "@simplified-identity/transforms";

/**
 * Color-coded Usages badge for the transforms list (#315).
 *
 * Tone mapping (drives both the Pill and the leading dot):
 *   - `usages >= 1`            → `success` (emerald)  — in-use
 *   - `usages === 0` & custom  → `warning` (amber)    — cleanup candidate
 *   - `usages === 0` & internal → `neutral` (grey)    — internal transforms
 *                                                       aren't expected to be
 *                                                       used everywhere
 *   - `usages === undefined`   → plain `—`             — usages couldn't be
 *                                                       computed; don't badge
 *
 * Clicking the badge opens the transform drawer on the Usage tab via
 * `?selected=<id>&tab=usage`. The drawer reads `?tab=` to initialise its
 * panel selection; if absent it stays on Configuration (existing behavior).
 *
 * The tooltip shows the usage breakdown by kind when entries are passed in.
 * The sidebar layout already provides a `<TooltipProvider>`, so callers
 * don't need to wrap us.
 */
export function UsagesCell({
  usages,
  internal,
  transformId,
  usagesEntries,
  className,
}: {
  usages: number | undefined;
  internal: boolean | undefined;
  transformId: string;
  /** Per-kind breakdown for the matching transform, used for the tooltip. */
  usagesEntries?: ReadonlyArray<UsageEntry>;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const href = React.useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("selected", transformId);
    params.set("tab", "usage");
    return `${pathname}?${params.toString()}`;
  }, [pathname, searchParams, transformId]);

  if (usages === undefined) {
    return (
      <span className={className}>
        <span className="text-muted-foreground/40">—</span>
      </span>
    );
  }

  const tone: "success" | "warning" | "neutral" =
    usages >= 1 ? "success" : internal ? "neutral" : "warning";

  const summary = `Used in ${usages} ${
    usages === 1 ? "place" : "places"
  }`;
  const breakdown = usagesEntries ? formatBreakdown(usagesEntries) : null;
  const tooltipText = breakdown ? `${summary} — ${breakdown}` : summary;

  return (
    <span className={className}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            scroll={false}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={tooltipText}
          >
            <Pill tone={tone} dot mono className="cursor-pointer">
              {usages}
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

/**
 * Renders the breakdown phrase for the tooltip, e.g.
 * "2 identity attributes, 1 source policy, 3 transforms".
 * Returns null when there's nothing to show.
 */
function formatBreakdown(entries: ReadonlyArray<UsageEntry>): string | null {
  if (entries.length === 0) return null;
  const counts = { profile: 0, source: 0, transform: 0 };
  for (const e of entries) {
    if (e.kind === "identity-profile") counts.profile += 1;
    else if (e.kind === "source-policy") counts.source += 1;
    else counts.transform += 1;
  }
  const parts: string[] = [];
  if (counts.profile > 0) {
    parts.push(
      `${counts.profile} identity attribute${counts.profile === 1 ? "" : "s"}`,
    );
  }
  if (counts.source > 0) {
    parts.push(
      `${counts.source} source ${counts.source === 1 ? "policy" : "policies"}`,
    );
  }
  if (counts.transform > 0) {
    parts.push(
      `${counts.transform} transform${counts.transform === 1 ? "" : "s"}`,
    );
  }
  return parts.length > 0 ? parts.join(", ") : null;
}
