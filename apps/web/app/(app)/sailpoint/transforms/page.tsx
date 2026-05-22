import { headers } from "next/headers";
import { Search } from "lucide-react";

import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { auth } from "@/lib/auth";
import { sailpointFetch } from "@/lib/sailpoint/client";
import {
  computeTransformUsageMap,
  type SourceWithPolicies,
  type UsageEntry,
} from "@simplified-identity/transforms";
import {
  groupFor,
  groupSlugFromParam,
  type TransformGroupSlug,
} from "@simplified-identity/transforms";

import { getOrComputeLint } from "@/lib/sailpoint/lint-runner";

import { PageShell } from "../../_components/page-shell";
import { StateView } from "@/components/ui/state-view";
import { GroupFilter } from "./_components/group-filter";
import { GroupingModeFilter } from "./_components/grouping-mode-filter";
import {
  type GroupingMode,
  groupingModeFromParam,
} from "./_components/grouping-mode-filter-shared";
import { summariseIssuesByTransformId } from "./_components/issues-badge-shared";
import { IssuesFilter } from "./_components/issues-filter";
import {
  type IssuesFilterValue,
  issuesFromParam,
} from "./_components/issues-filter-shared";
import { InternalFilter, type InternalFilterValue } from "./_components/internal-filter";
import { LayoutToggle, type Layout } from "./_components/layout-toggle";
import { PageActions } from "./_components/page-actions";
import { TransformDrawer } from "./_components/transform-drawer";
import { TransformsGrid } from "./_components/transforms-grid";
import { TransformsKpiStrip } from "./_components/transforms-kpi-strip";
import { TransformsTable } from "./_components/transforms-table";
import type { SelectableTransform } from "./_components/types";
import { TypeFilter } from "./_components/type-filter";
import { UsagesFilter, type UsagesFilterValue } from "./_components/usages-filter";

const PAGE_SIZES = [10, 15, 25, 50, 100] as const;
type PerPage = (typeof PAGE_SIZES)[number];
const DEFAULT_PER: PerPage = 25;

function internalFromParam(value: string | undefined): InternalFilterValue {
  if (value === "custom" || value === "builtin") return value;
  return "all";
}

/**
 * `?usages=0` is the only state today (binary "Unused" filter, #312).
 * Anything else (`?usages=1`, `?usages=5+`, …) is reserved for the
 * full filter shipping with #315 and is treated as "all" until then —
 * we don't 400 unknown params, we just no-op them.
 */
function usagesFromParam(value: string | undefined): UsagesFilterValue {
  return value === "0" ? "unused" : "all";
}

function layoutFromParam(value: string | undefined): Layout {
  return value === "grid" ? "grid" : "table";
}

function pageFromParam(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function perFromParam(value: string | undefined): PerPage {
  const n = Number(value);
  return (PAGE_SIZES as readonly number[]).includes(n)
    ? (n as PerPage)
    : DEFAULT_PER;
}

function buildHref(opts: {
  page?: number;
  per?: PerPage;
  q?: string;
  type?: string | null;
  internal?: InternalFilterValue;
  layout?: Layout;
  group?: TransformGroupSlug | null;
  groupBy?: GroupingMode;
  usages?: UsagesFilterValue;
  issues?: IssuesFilterValue;
}): string {
  const params = new URLSearchParams();
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  if (opts.per && opts.per !== DEFAULT_PER) params.set("per", String(opts.per));
  if (opts.q) params.set("q", opts.q);
  if (opts.type) params.set("type", opts.type);
  if (opts.internal && opts.internal !== "all")
    params.set("internal", opts.internal);
  if (opts.layout && opts.layout !== "table") params.set("layout", opts.layout);
  if (opts.group) params.set("group", opts.group);
  if (opts.groupBy) params.set("groupBy", opts.groupBy);
  if (opts.usages === "unused") params.set("usages", "0");
  if (opts.issues === "has-issues") params.set("issues", "1");
  const qs = params.toString();
  return qs ? `/sailpoint/transforms?${qs}` : "/sailpoint/transforms";
}

function Toolbar({
  per,
  q,
  type,
  internal,
  layout,
  group,
  groupBy,
  usages,
  issues,
  availableTypes,
  availableGroups,
}: {
  per: PerPage;
  q: string;
  type: string | null;
  internal: InternalFilterValue;
  layout: Layout;
  group: TransformGroupSlug | null;
  groupBy: GroupingMode;
  usages: UsagesFilterValue;
  issues: IssuesFilterValue;
  availableTypes: string[];
  availableGroups: TransformGroupSlug[];
}) {
  return (
    <FilterBar
      search={
        <form
          action="/sailpoint/transforms"
          method="get"
          className="relative min-w-[16rem] flex-1"
          role="search"
        >
          {per !== DEFAULT_PER && (
            <input type="hidden" name="per" value={String(per)} />
          )}
          {type && <input type="hidden" name="type" value={type} />}
          {internal !== "all" && (
            <input type="hidden" name="internal" value={internal} />
          )}
          {layout !== "table" && (
            <input type="hidden" name="layout" value={layout} />
          )}
          {group && <input type="hidden" name="group" value={group} />}
          {groupBy && (
            <input type="hidden" name="groupBy" value={groupBy} />
          )}
          {usages === "unused" && (
            <input type="hidden" name="usages" value="0" />
          )}
          {issues === "has-issues" && (
            <input type="hidden" name="issues" value="1" />
          )}
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name or type…"
            className="si-body h-9 w-full rounded-md border border-input bg-card pl-8 pr-10 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 inline-flex h-5 -translate-y-1/2 select-none items-center rounded border border-border bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground">
            /
          </kbd>
        </form>
      }
      filters={
        <>
          <TypeFilter availableTypes={availableTypes} selected={type} />
          <GroupFilter availableGroups={availableGroups} selected={group} />
          <InternalFilter selected={internal} />
          <GroupingModeFilter selected={groupBy} />
          <UsagesFilter selected={usages} />
          <IssuesFilter selected={issues} />
        </>
      }
      trailing={
        <LayoutToggle
          layout={layout}
          hrefFor={(l) =>
            buildHref({ per, q, type, internal, layout: l, group, groupBy, usages, issues })
          }
        />
      }
    />
  );
}


export default async function TransformsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    per?: string;
    q?: string;
    type?: string;
    internal?: string;
    layout?: string;
    group?: string;
    groupBy?: string;
    usages?: string;
    issues?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const params = await searchParams;
  const per = perFromParam(params.per);
  const q = (params.q ?? "").trim();
  const typeFilter = (params.type ?? "").trim() || null;
  const internalFilter = internalFromParam(params.internal);
  const layout = layoutFromParam(params.layout);
  const groupFilter = groupSlugFromParam(params.group);
  const groupingMode = groupingModeFromParam(params.groupBy);
  const usagesFilter = usagesFromParam(params.usages);
  const issuesFilter = issuesFromParam(params.issues);

  const userId = session.user.id;
  // Same scope key derivation as `/api/sailpoint/transforms/lint` —
  // keeps the cache hits aligned between the API endpoint (KPI card,
  // drawer Issues tab) and the server render here. ADR §Q1.
  const scopeKey =
    (session.session as { activeOrganizationId?: string | null })
      .activeOrganizationId ?? userId;

  // Concurrent fetches are now safe — the access_token refresh path is
  // coalesced per-user inside sailpointFetch (one in-flight refresh, all
  // callers await the same promise).
  const [result, profilesResult, sourcesResult] = await Promise.all([
    sailpointFetch<SelectableTransform[]>(
      userId,
      "/v2025/transforms?limit=250",
    ),
    // Best-effort: timeout + catch so a slow or failing identity-profiles
    // call simply hides the Usages column (renders "—") instead of breaking
    // the page.
    sailpointFetch<unknown[]>(userId, "/v2025/identity-profiles", {
      signal: AbortSignal.timeout(8000),
    }).catch(() => ({
      ok: false as const,
      error: {
        kind: "api_error" as const,
        status: 0,
        message: "timeout",
      },
    })),
    sailpointFetch<{ id: string; name: string }[]>(
      userId,
      "/v2025/sources?limit=250",
      { signal: AbortSignal.timeout(8000) },
    ).catch(() => ({
      ok: false as const,
      error: {
        kind: "api_error" as const,
        status: 0,
        message: "timeout",
      },
    })),
  ]);

  // Fan-out: for each source, pull its provisioning policies. Best-effort —
  // any timeout / 4xx just contributes 0 to the usages count.
  const sourcesWithPolicies: SourceWithPolicies[] = sourcesResult.ok
    ? await Promise.all(
        sourcesResult.data.map(async (s) => ({
          id: s.id,
          name: s.name,
          policies: await sailpointFetch<unknown[]>(
            userId,
            `/v2025/sources/${encodeURIComponent(s.id)}/provisioning-policies`,
            { signal: AbortSignal.timeout(6000) },
          )
            .then((r) => (r.ok ? r.data : []))
            .catch(() => [] as unknown[]),
        })),
      )
    : [];

  if (!result.ok) {
    return (
      <PageShell
        title="Transforms"
        description="Identity transforms defined on the connected SailPoint tenant."
      >
        <StateView
          intent={result.error.kind}
          title={
            result.error.kind === "not_connected"
              ? "Connect your SailPoint tenant"
              : result.error.kind === "auth_failed"
                ? "SailPoint session expired"
                : "SailPoint API error"
          }
          description={
            result.error.kind === "not_connected"
              ? "Sign in with SailPoint to load this view from your tenant."
              : result.error.kind === "auth_failed"
                ? "Your access to SailPoint was revoked or has expired. Sign in again to continue."
                : "The request failed. Try again, or contact your administrator if it persists."
          }
          detail={
            result.error.kind === "api_error"
              ? `${result.error.status} ${result.error.message}`
              : undefined
          }
        />
      </PageShell>
    );
  }

  // We treat usages as "available" as long as at least one of the three
  // sources resolved. If all three fail, the column shows "—".
  const usagesAvailable =
    profilesResult.ok ||
    sourcesResult.ok ||
    sourcesWithPolicies.some((s) => s.policies.length > 0);
  const usagesByName: Map<string, UsageEntry[]> = usagesAvailable
    ? computeTransformUsageMap(
        result.data,
        profilesResult.ok ? profilesResult.data : [],
        sourcesWithPolicies,
      )
    : new Map();

  const enriched: SelectableTransform[] = result.data.map((t) => ({
    ...t,
    usages: usagesAvailable ? (usagesByName.get(t.name)?.length ?? 0) : undefined,
  }));

  // Server-side lint compute (ADR §Q1) — reuses the 5-min in-memory cache
  // shared with `/api/sailpoint/transforms/lint`, so the cost is amortized
  // across the page render + the KPI card / drawer Issues tab. Best-effort:
  // a lint failure must not break the list page (degrade to "no badges,
  // no filter narrowing" — same convention as the usages roll-up).
  const lintEntry = await getOrComputeLint(scopeKey, userId).catch(() => null);
  const issuesByTransformId = summariseIssuesByTransformId(
    lintEntry?.result.byTransformId,
  );
  const lintAvailable = lintEntry !== null;

  const all = [...enriched].sort((a, b) => a.name.localeCompare(b.name));

  // Full tenant name list, passed down to the row Duplicate dialog so it can
  // pre-compute a unique `(copy N)` default client-side without a round-trip.
  // Server-side action re-validates uniqueness on submit.
  const tenantTransformNames: string[] = all.map((t) => t.name);

  const byInternal =
    internalFilter === "custom"
      ? all.filter((t) => !t.internal)
      : internalFilter === "builtin"
        ? all.filter((t) => t.internal)
        : all;

  const availableTypes = Array.from(
    new Set(byInternal.map((t) => t.type)),
  ).sort();
  const availableGroups = Array.from(
    new Set(byInternal.map((t) => groupFor(t.type).slug)),
  ).sort() as TransformGroupSlug[];

  const byType = typeFilter
    ? byInternal.filter((t) => t.type === typeFilter)
    : byInternal;

  const byGroup = groupFilter
    ? byType.filter((t) => groupFor(t.type).slug === groupFilter)
    : byType;

  const needle = q.toLowerCase();
  const bySearch = needle
    ? byGroup.filter(
        (t) =>
          t.name.toLowerCase().includes(needle) ||
          t.type.toLowerCase().includes(needle),
      )
    : byGroup;

  // `?usages=0` — narrow to transforms with zero usages (the binary
  // "Unused" filter, #312). When the usages roll-up couldn't be
  // computed (every transform has `usages: undefined`), the filter
  // silently no-ops to "show all" instead of rendering an empty page
  // for the wrong reason — same degradation pattern as the Identity
  // attributes drift filter when no snapshot exists yet.
  const byUsages =
    usagesFilter === "unused" && usagesAvailable
      ? bySearch.filter((t) => (t.usages ?? 0) === 0)
      : bySearch;

  // `?issues=1` — narrow to transforms with at least one lint finding
  // (#310 PR 4/4). Same degradation rule as `usages`: when the lint
  // result is unavailable (cache miss + fetch failed), the filter
  // silently no-ops rather than render an empty page for the wrong
  // reason. The KPI strip's Issues count keeps reflecting whatever the
  // lint endpoint returns — server here, client there, both behind the
  // same 5-min cache.
  const filtered =
    issuesFilter === "has-issues" && lintAvailable
      ? byUsages.filter((t) => issuesByTransformId.has(t.id))
      : byUsages;

  // KPI counts reflect the *visible* (post-filter) set, per #312. The
  // `Unused` card's CTA flips `?usages=0` → after the navigation, the
  // filter is active and the strip is self-confirming (total = unused,
  // in-use = 0); that's the intended effect, the user sees the slice
  // they asked for.
  const kpis = {
    total: filtered.length,
    builtinCount: filtered.filter((t) => t.internal === true).length,
    customCount: filtered.filter((t) => t.internal !== true).length,
    inUseCount: filtered.filter((t) => (t.usages ?? 0) > 0).length,
    unusedCount: filtered.filter((t) => (t.usages ?? 0) === 0).length,
    usagesAvailable,
  };

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / per));
  const requestedPage = pageFromParam(params.page);
  const page = Math.min(requestedPage, totalPages);
  const visible = filtered.slice((page - 1) * per, page * per);
  const rangeStart = total === 0 ? 0 : (page - 1) * per + 1;
  const rangeEnd = Math.min(page * per, total);

  return (
    // The drawer is `position: fixed` top-right and publishes its width on
    // `:root` via the `--workspace-drawer-width` CSS variable; the app layout
    // consumes it as `padding-right` to push the topbar + page chrome to the
    // left. So the page itself can stay a plain `<PageShell>` here — no split
    // layout to wire up.
    <>
      <PageShell
        title="Transforms"
        description="Identity transforms defined on the connected SailPoint tenant."
        actions={<PageActions />}
      >
        <div className="space-y-4">
          <TransformsKpiStrip kpis={kpis} />
          <Toolbar
            per={per}
            q={q}
            type={typeFilter}
            internal={internalFilter}
            layout={layout}
            group={groupFilter}
            groupBy={groupingMode}
            usages={usagesFilter}
            issues={issuesFilter}
            availableTypes={availableTypes}
            availableGroups={availableGroups}
          />
          {layout === "grid" ? (
            <TransformsGrid
              transforms={visible}
              tenantTransformNames={tenantTransformNames}
              usagesByName={usagesByName}
              issuesByTransformId={issuesByTransformId}
            />
          ) : (
            <TransformsTable
              data={visible}
              tenantTransformNames={tenantTransformNames}
              usagesByName={usagesByName}
              issuesByTransformId={issuesByTransformId}
              groupBy={groupingMode}
            />
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            perPage={per}
            perPageOptions={PAGE_SIZES}
            hrefForPage={(p) =>
              buildHref({ page: p, per, q, type: typeFilter, internal: internalFilter, layout, group: groupFilter, groupBy: groupingMode, usages: usagesFilter, issues: issuesFilter })
            }
            hrefForPerPage={(n) =>
              buildHref({ page: 1, per: n as PerPage, q, type: typeFilter, internal: internalFilter, layout, group: groupFilter, groupBy: groupingMode, usages: usagesFilter, issues: issuesFilter })
            }
          />
        </div>
      </PageShell>
      <TransformDrawer
        transforms={enriched}
        usagesByName={usagesByName}
        usagesAvailable={usagesAvailable}
      />
    </>
  );
}
