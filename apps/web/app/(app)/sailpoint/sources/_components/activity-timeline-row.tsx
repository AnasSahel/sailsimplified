"use client";

import * as React from "react";
import { Bot, Server, User as UserIcon, UserX } from "lucide-react";

import { Pill, type PillTone } from "@/components/ui/pill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ActivityActor,
  ActivityEntry,
  ActivitySeverity,
} from "@/lib/sailpoint/sources-api";
import { cn } from "@/lib/utils";

import { ActivityInlineDiff } from "./activity-inline-diff";

/**
 * `<ActivityTimelineRow>` — single row of the source activity timeline.
 *
 * Layout (left to right):
 *   - Severity dot (info/warning/danger) on the rail.
 *   - Body:
 *      · timestamp (relative + absolute tooltip)
 *      · actor pill (typed by `actor.kind` union)
 *      · origin badge (`App` / `ISC`) — ADR D3 merge transparency
 *      · summary
 *      · optional collapsible inline diff
 *
 * Marked `"use client"` because of the diff collapsible state + the
 * Radix Tooltip primitive on the timestamp (Radix `asChild` needs a
 * client boundary — see feedback_radix_aschild_client_boundary).
 */

const SEVERITY_TONE: Record<ActivitySeverity, PillTone> = {
  info: "info",
  warning: "warning",
  danger: "danger",
};

const SEVERITY_DOT_CLASS: Record<ActivitySeverity, string> = {
  info: "bg-sky-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

/**
 * Pre-formatted absolute timestamp (server) + a relative one that we
 * (re)compute live so the row doesn't become stale between renders.
 * Falls back gracefully if the input isn't parseable.
 */
function formatRelative(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

function ActorPill({ actor }: { actor: ActivityActor }) {
  let tone: PillTone;
  let icon: React.ReactNode;
  let label: string;
  let title: string;
  switch (actor.kind) {
    case "app-user": {
      tone = "accent";
      icon = <UserIcon className="h-3 w-3" aria-hidden />;
      // Prefer name → email → userId. The factory resolves these in a
      // batched lookup so a fallback to userId is rare but possible.
      label = actor.name ?? actor.email ?? `User ${actor.userId.slice(0, 8)}`;
      title = `App user · ${actor.email ?? actor.userId}`;
      return (
        <Pill tone={tone} className="gap-1 max-w-[14rem]" title={title}>
          {icon}
          <span className="truncate">App: {label}</span>
        </Pill>
      );
    }
    case "isc-system": {
      tone = "neutral";
      icon = <Server className="h-3 w-3" aria-hidden />;
      label = actor.label;
      title = `ISC system · ${label}`;
      return (
        <Pill tone={tone} className="gap-1 max-w-[14rem]" title={title}>
          {icon}
          <span className="truncate">System: {label}</span>
        </Pill>
      );
    }
    case "isc-user": {
      tone = "neutral";
      icon = <Bot className="h-3 w-3" aria-hidden />;
      label = actor.name ?? actor.email ?? "ISC user";
      title = `ISC user · ${actor.email ?? "unknown email"}`;
      return (
        <Pill tone={tone} className="gap-1 max-w-[14rem]" title={title}>
          {icon}
          <span className="truncate">ISC: {label}</span>
        </Pill>
      );
    }
    case "unknown":
    default: {
      tone = "neutral";
      icon = <UserX className="h-3 w-3" aria-hidden />;
      label = (actor as { label?: string }).label ?? "Unknown";
      title = "Unknown actor";
      return (
        <Pill tone={tone} className="gap-1 max-w-[14rem]" title={title}>
          {icon}
          <span className="truncate">{label}</span>
        </Pill>
      );
    }
  }
}

function hasSnapshot(entry: ActivityEntry): boolean {
  return entry.beforeSnapshot !== undefined || entry.afterSnapshot !== undefined;
}

export function ActivityTimelineRow({
  entry,
  isLast,
}: {
  entry: ActivityEntry;
  /** Skip the trailing rail line on the bottom-most entry. */
  isLast?: boolean;
}) {
  const occurredAtMs = React.useMemo(() => {
    const t = Date.parse(entry.occurredAt);
    return Number.isFinite(t) ? t : null;
  }, [entry.occurredAt]);

  const [now, setNow] = React.useState<number>(() => Date.now());
  React.useEffect(() => {
    // Re-tick once a minute. Negligible cost — a single timer per row.
    const handle = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(handle);
  }, []);

  const relative =
    occurredAtMs !== null ? formatRelative(now - occurredAtMs) : entry.occurredAt;
  const absolute =
    occurredAtMs !== null
      ? new Date(occurredAtMs).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "medium",
        })
      : entry.occurredAt;

  return (
    <li className="relative flex gap-3 pl-1">
      {/* Rail + severity dot */}
      <div className="relative flex w-3 shrink-0 justify-center">
        <span
          aria-hidden
          className={cn(
            "z-10 mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
            SEVERITY_DOT_CLASS[entry.severity],
          )}
        />
        {!isLast && (
          <span
            aria-hidden
            className="absolute left-1/2 top-3 -translate-x-1/2 h-[calc(100%+0.5rem)] w-px bg-border"
          />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 pb-5">
        <div className="flex flex-wrap items-center gap-2 si-caption">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <time
                  dateTime={entry.occurredAt}
                  className="text-muted-foreground"
                >
                  {relative}
                </time>
              </TooltipTrigger>
              <TooltipContent side="top">{absolute}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-muted-foreground/60">·</span>
          <ActorPill actor={entry.actor} />
          <Pill tone={SEVERITY_TONE[entry.severity]} className="font-mono">
            {entry.action}
          </Pill>
          <Pill
            tone="neutral"
            className="uppercase tracking-wide"
            title={
              entry.origin === "app"
                ? "Originated from this app's audit log"
                : "Originated from the ISC events index"
            }
          >
            {entry.origin}
          </Pill>
        </div>
        <p className="mt-1 si-body text-foreground">{entry.summary}</p>
        {hasSnapshot(entry) && (
          <ActivityInlineDiff
            before={entry.beforeSnapshot}
            after={entry.afterSnapshot}
          />
        )}
      </div>
    </li>
  );
}
