import { Activity, Clock, Database, Layers, UserCircle } from "lucide-react";

import { Pill, type PillTone } from "@/components/ui/pill";
import { StatGroup, type StatItem } from "@/components/ui/stat-group";
import type { SourceAccount } from "@/lib/sailpoint/sources-api";

/**
 * `<SourceStatStrip>` — 5-stat horizontal strip rendered above the
 * source detail tabs (issue #256). Reuses the `<StatGroup layout="inline">`
 * primitive so spacing, dividers, and small-viewport collapse stay
 * consistent with other detail pages.
 *
 * Data shape is intentionally pre-resolved upstream (in `page.tsx`) so
 * this component stays a pure formatter — no fetches, no async work,
 * no error branches. Missing values render as `—` per design contract.
 *
 * Layout note: 5 cells get cramped between `sm` (640px) and `md` (768px)
 * because long labels ("Last aggregation", "Identity profile") wrap. We
 * wrap `<StatGroup>` in a container that forces the 2-row grid up to
 * 960px and only switches to the dense inline strip beyond that.
 */

const NUMBER_FMT = new Intl.NumberFormat("en-US");
const DATETIME_FMT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Age thresholds (ms) for the last-aggregation tone. */
const FRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h → success
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7d → warning, beyond → danger

export type SourceStatStripProps = {
  /** Total accounts on the source (from `count=true`). `null` if the call failed. */
  accountsTotal: number | null;
  /**
   * Sample of accounts already fetched for the Overview tab. We don't
   * re-fetch — `correlated` and `orphans` are derived from the same
   * sample the Overview KPIs use, so the two stay numerically aligned.
   */
  sampleAccounts: SourceAccount[];
  /** Result of `countEntitlements({ sourceId })`. Always a number — failures collapse to `0`. */
  entitlementsTotal: number;
  /** `source.since` — ISO timestamp of the last health flip / aggregation. */
  since: string | null;
  /**
   * `source.healthy` — drives the failure branch of the last-aggregation
   * tone. When `false`, the pill switches to `danger` regardless of age.
   */
  healthy?: boolean | null;
  /**
   * `source.status` — backup signal for failure detection. ISC emits
   * strings like `SOURCE_STATE_ERROR_*` / `*_FAILURE_*` that flip the
   * pill to `danger` even if `healthy` is undefined.
   */
  status?: string | null;
  /** Best-effort schedule label parsed from `connectorAttributes`. `null` if unparseable. */
  scheduleLabel: string | null;
  /** Identity profile name resolved via local match on `authoritativeSource.id`. */
  identityProfileName: string | null;
  /**
   * Identity profile id — when set, the Identity profile cell links to
   * `/sailpoint/identity-profiles/<id>`. `null` for non-authoritative
   * sources (cell renders `—` and is not clickable).
   */
  identityProfileId?: string | null;
};

export function SourceStatStrip({
  accountsTotal,
  sampleAccounts,
  entitlementsTotal,
  since,
  healthy,
  status,
  scheduleLabel,
  identityProfileName,
  identityProfileId,
}: SourceStatStripProps) {
  const correlated = sampleAccounts.filter((a) => Boolean(a.identityId)).length;
  const orphans = Math.max(0, sampleAccounts.length - correlated);

  const aggregationState = since
    ? classifyAggregation(since, healthy ?? undefined, status ?? undefined)
    : null;

  const items: StatItem[] = [
    {
      label: "Accounts",
      value:
        accountsTotal !== null ? NUMBER_FMT.format(accountsTotal) : "—",
      sub:
        sampleAccounts.length > 0
          ? `${NUMBER_FMT.format(correlated)} correlated · ${NUMBER_FMT.format(orphans)} orphans`
          : "No accounts to sample",
      icon: <Database className="h-4 w-4" />,
    },
    {
      label: "Entitlements",
      value: NUMBER_FMT.format(entitlementsTotal),
      sub: "On this source",
      icon: <Layers className="h-4 w-4" />,
    },
    {
      label: "Last aggregation",
      value: since ? formatRelative(since) : "—",
      sub: aggregationState ? (
        <LastAggregationSub since={since!} state={aggregationState} />
      ) : (
        "Never run"
      ),
      icon: <Clock className="h-4 w-4" />,
    },
    {
      label: "Schedule",
      value: scheduleLabel ?? "—",
      sub: scheduleLabel ? "Configured" : "Not configured",
      icon: <Activity className="h-4 w-4" />,
    },
    {
      label: "Identity profile",
      value: identityProfileName ?? "—",
      sub: identityProfileName ? "Authoritative" : "None matched",
      icon: <UserCircle className="h-4 w-4" />,
      href:
        identityProfileName && identityProfileId
          ? `/sailpoint/identity-profiles/${encodeURIComponent(identityProfileId)}`
          : undefined,
    },
  ];

  // Force the StatGroup's `sm:` inline-strip variant to wait until
  // `min-[960px]:` — 5 cells get cramped between 640px and 960px (long
  // labels wrap). Below 960px we stay in the 2-col grid; at and above
  // 960px the dense inline strip takes over.
  //
  // The override class names mirror the StatGroup primitive: anything it
  // applies at `sm:` we cancel back to its mobile defaults (grid, gap,
  // padding, border) and re-apply the inline-strip styling at `min-[960px]:`.
  return (
    <div
      className={[
        // Cancel StatGroup's `sm:flex sm:gap-0 sm:rounded-lg sm:border sm:bg-card sm:divide-x`.
        "[&>div]:sm:!grid [&>div]:sm:!grid-cols-2 [&>div]:sm:!gap-3",
        "[&>div]:sm:!rounded-none [&>div]:sm:!border-0 [&>div]:sm:!bg-transparent",
        "[&>div]:sm:!divide-x-0",
        // Re-enable the inline strip at 960px+.
        "[&>div]:min-[960px]:!flex [&>div]:min-[960px]:!gap-0",
        "[&>div]:min-[960px]:!rounded-lg [&>div]:min-[960px]:!border",
        "[&>div]:min-[960px]:!bg-card [&>div]:min-[960px]:!divide-x",
        // Each cell: cancel `sm:flex-1 sm:rounded-none sm:border-0 ...` so
        // it stays a self-contained card below 960px, then re-apply the
        // inline-strip cell styling at 960px+.
        "[&>div>div]:sm:!flex-none [&>div>div]:sm:!rounded-lg",
        "[&>div>div]:sm:!border [&>div>div]:sm:!bg-card",
        "[&>div>div]:sm:!px-4 [&>div>div]:sm:!py-4",
        "[&>div>div]:min-[960px]:!flex-1 [&>div>div]:min-[960px]:!rounded-none",
        "[&>div>div]:min-[960px]:!border-0 [&>div>div]:min-[960px]:!bg-transparent",
        "[&>div>div]:min-[960px]:!px-5 [&>div>div]:min-[960px]:!py-4",
        // Same treatment for cells wrapped in a `<Link>` (when `href`
        // is set) — StatGroup wraps the body in an `<a>` that also
        // carries the `sm:` flex-row classes.
        "[&>div>a]:sm:!block [&>div>a]:sm:!rounded-lg",
        "[&>div>a]:min-[960px]:!flex [&>div>a]:min-[960px]:!flex-1",
        "[&>div>a]:min-[960px]:!rounded-none",
      ].join(" ")}
    >
      <StatGroup layout="inline" items={items} />
    </div>
  );
}

/** Tone + label for the last-aggregation pill, derived from age + health. */
type AggregationState = {
  tone: PillTone;
  label: string;
};

function classifyAggregation(
  since: string,
  healthy: boolean | undefined,
  status: string | undefined,
): AggregationState | null {
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) return null;

  // Explicit failure beats age. ISC status strings like
  // `SOURCE_STATE_ERROR_*` and `*_FAILURE_*` are the published markers;
  // we regex-match them rather than enumerate (ISC doesn't expose a
  // closed enum).
  const statusStr = status ?? "";
  const failedByStatus = /FAILURE|ERROR/i.test(statusStr);
  const failed = healthy === false || failedByStatus;
  if (failed) {
    return { tone: "danger", label: "Failed" };
  }

  const ageMs = Math.max(0, Date.now() - t);
  if (ageMs < FRESH_THRESHOLD_MS) {
    return { tone: "success", label: "Succeeded" };
  }
  if (ageMs < STALE_THRESHOLD_MS) {
    return { tone: "warning", label: "Stale" };
  }
  return { tone: "danger", label: "Outdated" };
}

function LastAggregationSub({
  since,
  state,
}: {
  since: string;
  state: AggregationState;
}) {
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) return <span>—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Pill tone={state.tone} dot>
        {state.label}
      </Pill>
      <span
        className="text-muted-foreground/80"
        title={DATETIME_FMT.format(new Date(t))}
      >
        {DATETIME_FMT.format(new Date(t))}
      </span>
    </span>
  );
}

/**
 * Tiny relative-time formatter — mirrors the one in `<SourceOverview>`.
 * Kept inline rather than extracted to avoid a shared module dance for a
 * 15-line helper used in two places (will refactor when a 3rd consumer
 * lands).
 */
function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  const remSec = sec - min * 60;
  if (min < 60)
    return remSec > 0 && min < 10
      ? `${min}m ${remSec}s ago`
      : `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

// Schedule parsing helper now lives in `source-config-helpers.ts` (shared
// with `<SourceOverview>`). Re-exported here so existing call sites
// (`page.tsx`) keep their import path until they're migrated.
export { parseScheduleFromConnectorAttributes } from "./source-config-helpers";
