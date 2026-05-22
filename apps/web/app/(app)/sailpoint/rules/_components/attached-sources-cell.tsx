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
import type { RuleUsageEntry } from "@simplified-identity/rules";

/**
 * Color-coded "Attached sources" cell — the connector-rules analog of the
 * transforms Usages cell (#345).
 *
 * Tone mapping:
 *   - `attached >= 1`     → `success` (emerald) — wired to a source, executes
 *   - `attached === 0`    → `warning` (amber)   — unattached / dead code
 *   - `attached === undefined` → plain `—`      — usages couldn't be computed
 *
 * Clicking opens the rule drawer (`?selected=<id>`), which carries the
 * full "Attached sources" panel. The tooltip names the attached sources.
 */
export function AttachedSourcesCell({
  attached,
  ruleId,
  entries,
  className,
}: {
  attached: number | undefined;
  ruleId: string;
  /** Per-rule source-attachment list, used for the tooltip. */
  entries?: ReadonlyArray<RuleUsageEntry>;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const href = React.useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("selected", ruleId);
    return `${pathname}?${params.toString()}`;
  }, [pathname, searchParams, ruleId]);

  if (attached === undefined) {
    return (
      <span className={className}>
        <span className="text-muted-foreground/40">—</span>
      </span>
    );
  }

  const tone: "success" | "warning" = attached >= 1 ? "success" : "warning";
  const summary =
    attached === 0
      ? "Not attached to any source"
      : `Attached to ${attached} ${attached === 1 ? "source" : "sources"}`;
  const names = entries?.map((e) => e.sourceName).filter(Boolean);
  const tooltipText =
    names && names.length > 0 ? `${summary} — ${names.join(", ")}` : summary;

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
              {attached}
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
