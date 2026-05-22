"use client";

import { Clock } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Threshold past which a transform is flagged as stale on the list view
 * (#314). Hardcoded because the value is a UX call, not tenant config —
 * if it ever needs to be tunable per org, lift to settings.
 */
export const STALE_DAYS = 180;
const DAY_MS = 86_400_000;

const RTF = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

/**
 * `<LastModifiedCell>` — relative time + amber clock badge when the last
 * edit is older than `STALE_DAYS`. Renders an em-dash if the API didn't
 * return a `modified` value (or it's unparseable), in which case the
 * stale check is skipped.
 */
export function LastModifiedCell({ value }: { value: string | null | undefined }) {
  if (!value) return <EmDash />;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return <EmDash />;

  const { label, isStale, months } = describe(d);

  if (!isStale) {
    return (
      <span className="si-caption text-muted-foreground">{label}</span>
    );
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 si-caption text-muted-foreground",
            )}
          >
            <Clock
              aria-hidden
              className="h-3 w-3 shrink-0 text-amber-500 dark:text-amber-400"
              strokeWidth={2.25}
            />
            <span>{label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{`Not modified in ${months} months`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function EmDash() {
  return <span className="si-caption text-muted-foreground/50">—</span>;
}

/**
 * Pulled out of the component body so the React 19 compiler doesn't flag
 * `Date.now()` as an impure call inside render — same trick as
 * `<TimestampCell>`'s `formatRelative` helper.
 */
function describe(d: Date): { label: string; isStale: boolean; months: number } {
  const ageDays = Math.max(0, Math.round((Date.now() - d.getTime()) / DAY_MS));
  const isStale = ageDays > STALE_DAYS;
  const months = Math.max(1, Math.round(ageDays / 30));
  return { label: formatRelative(d), isStale, months };
}

function formatRelative(d: Date): string {
  const diff = d.getTime() - Date.now();
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 60) return RTF.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RTF.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return RTF.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return RTF.format(months, "month");
  const years = Math.round(months / 12);
  return RTF.format(years, "year");
}
