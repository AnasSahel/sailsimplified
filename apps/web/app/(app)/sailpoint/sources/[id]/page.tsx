import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { StateView } from "@/components/ui/state-view";
import { Tabs } from "@/components/ui/tabs";
import { auth } from "@/lib/auth";
import { listIdentityProfiles } from "@/lib/sailpoint/identities-api";
import {
  getSchemaAttributeConsumers,
  getSourceTransformConsumers,
} from "@/lib/sailpoint/source-attribute-consumers";
import {
  safeCaptureAndCompareSchema,
  type SourceSchemaDrift,
} from "@/lib/sailpoint/source-schema-drift";
import {
  countAccountEntitlements,
  countEntitlements,
  getCorrelationConfig,
  getSchemaMappings,
  getSource,
  getSourceAccounts,
  getSourceSchemas,
  listAggregationRuns,
  listSourceActivity,
  type AggregationRun,
  type ListSourceActivityFilters,
  type SourceAccount,
} from "@/lib/sailpoint/sources-api";

import { DetailShell } from "../../../_components/detail-shell";
import { AccountsCorrelationFilter } from "../_components/accounts-correlation-filter";
import {
  ACCOUNT_CORRELATION_OPTIONS,
  ACCOUNT_MANAGER_OPTIONS,
  ACCOUNT_REFRESH_OPTIONS,
  ACCOUNT_STATUS_OPTIONS,
  extractManagerId,
  MANAGER_ATTRIBUTE_NAMES,
  type AccountCorrelationFilterValue,
  type AccountManagerFilterValue,
  type AccountRefreshFilterValue,
  type AccountStatusFilterValue,
} from "../_components/accounts-filters-shared";
import { AccountsManagerFilter } from "../_components/accounts-manager-filter";
import { AccountsRefreshFilter } from "../_components/accounts-refresh-filter";
import { AccountsSearchBox } from "../_components/accounts-search-box";
import { AccountsStatusFilter } from "../_components/accounts-status-filter";
import { isAggregationRunning } from "../_components/aggregation-status-shared";
import {
  ACTIVITY_ACTION_OPTIONS,
  ACTIVITY_ACTOR_OPTIONS,
  ACTIVITY_DEFAULT_LIMIT,
  ACTIVITY_MAX_LIMIT,
  ACTIVITY_RANGE_OPTIONS,
  activityRangeCutoffIso,
  type ActivityActionFilterValue,
  type ActivityActorFilterValue,
  type ActivityRangeFilterValue,
} from "../_components/activity-filters-shared";
import {
  DEFAULT_RANGE,
  rangeFromParam,
  statusFromParam,
  triggerFromParam,
} from "../_components/aggregations-shared";
import { SourceActivityTab } from "../_components/source-activity-tab";
import { SourceAccountsTable } from "../_components/source-accounts-table";
import { SourceAggregationsTab } from "../_components/source-aggregations-tab";
import { SourceDetailHeader } from "../_components/source-detail-header";
import { SourceOverview } from "../_components/source-overview";
import { SourceProvisioningTab } from "../_components/source-provisioning-tab";
import { SourceSchemas } from "../_components/source-schemas";
import {
  parseScheduleFromConnectorAttributes,
  SourceStatStrip,
} from "../_components/source-stat-strip";

type TabId =
  | "overview"
  | "accounts"
  | "schemas"
  | "provisioning"
  | "aggregations"
  | "activity";
const TABS: TabId[] = [
  "overview",
  "accounts",
  "schemas",
  "provisioning",
  "aggregations",
  "activity",
];

const ACCOUNTS_PAGE_SIZES = [25, 50, 100, 250] as const;
type AccountsPerPage = (typeof ACCOUNTS_PAGE_SIZES)[number];
const DEFAULT_ACCOUNTS_PER: AccountsPerPage = 25;

/**
 * How many accounts to sample for the Overview KPIs (correlation rate
 * and attribute coverage). Capped at 250 because ISC paginates and these
 * KPIs degrade gracefully on larger tenants — the sub-line flags the
 * sample when `total > sample`.
 */
const OVERVIEW_SAMPLE_SIZE = 250;

function tabFromParam(value: string | undefined): TabId {
  return (TABS as readonly string[]).includes(value ?? "")
    ? (value as TabId)
    : "overview";
}

function accountsPerFromParam(value: string | undefined): AccountsPerPage {
  const n = Number(value);
  return (ACCOUNTS_PAGE_SIZES as readonly number[]).includes(n)
    ? (n as AccountsPerPage)
    : DEFAULT_ACCOUNTS_PER;
}

function accountsPageFromParam(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

const VALID_ACC_STATUS_VALUES = new Set<AccountStatusFilterValue>(
  ACCOUNT_STATUS_OPTIONS.map((o) => o.value),
);
const VALID_ACC_CORRELATION_VALUES = new Set<AccountCorrelationFilterValue>(
  ACCOUNT_CORRELATION_OPTIONS.map((o) => o.value),
);
const VALID_ACC_MANAGER_VALUES = new Set<AccountManagerFilterValue>(
  ACCOUNT_MANAGER_OPTIONS.map((o) => o.value),
);
const VALID_ACC_REFRESH_VALUES = new Set<AccountRefreshFilterValue>(
  ACCOUNT_REFRESH_OPTIONS.map((o) => o.value),
);

function accStatusFromParam(
  value: string | undefined,
): AccountStatusFilterValue | null {
  if (!value) return null;
  const v = value.toLowerCase() as AccountStatusFilterValue;
  return VALID_ACC_STATUS_VALUES.has(v) ? v : null;
}

function accCorrelationFromParam(
  value: string | undefined,
): AccountCorrelationFilterValue | null {
  if (!value) return null;
  const v = value.toLowerCase() as AccountCorrelationFilterValue;
  return VALID_ACC_CORRELATION_VALUES.has(v) ? v : null;
}

function accManagerFromParam(
  value: string | undefined,
): AccountManagerFilterValue | null {
  if (!value) return null;
  const v = value.toLowerCase() as AccountManagerFilterValue;
  return VALID_ACC_MANAGER_VALUES.has(v) ? v : null;
}

function accRefreshFromParam(
  value: string | undefined,
): AccountRefreshFilterValue | null {
  if (!value) return null;
  const v = value.toLowerCase() as AccountRefreshFilterValue;
  return VALID_ACC_REFRESH_VALUES.has(v) ? v : null;
}

/**
 * Compute an ISO cutoff (UTC) for the "Last refresh" range. `older`
 * inverts the comparison — the filter expression caller must use `le`
 * instead of `gt` in that case.
 */
function refreshCutoffIso(value: AccountRefreshFilterValue): string {
  const now = Date.now();
  const ms =
    value === "24h"
      ? 24 * 60 * 60 * 1000
      : value === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000; // 30d and 'older' both pivot on 30d
  return new Date(now - ms).toISOString();
}

/**
 * Builds the SailPoint `filters` expression from URL state for the
 * accounts query. The source-id scope is added by the
 * `getSourceAccounts` factory — this returns only the extra clauses.
 */
function buildAccountsFilter({
  q,
  status,
  correlation,
  manager,
  refresh,
}: {
  q: string;
  status: AccountStatusFilterValue | null;
  correlation: AccountCorrelationFilterValue | null;
  manager: AccountManagerFilterValue | null;
  refresh: AccountRefreshFilterValue | null;
}): string | undefined {
  const clauses: string[] = [];
  if (q) {
    const escaped = q.replace(/"/g, '\\"');
    // `name` and `nativeIdentity` are the two human-facing handles on
    // an account row. Wrap in parentheses to keep the OR scoped.
    clauses.push(
      `(name co "${escaped}" or nativeIdentity co "${escaped}")`,
    );
  }
  if (status === "enabled") {
    clauses.push("disabled eq false");
  } else if (status === "disabled") {
    clauses.push("disabled eq true");
  }
  if (correlation === "orphan") {
    clauses.push("uncorrelated eq true");
  } else if (correlation === "correlated") {
    clauses.push("uncorrelated eq false");
  }
  if (manager === "yes") {
    clauses.push("attributes.managerId pr");
  } else if (manager === "no") {
    clauses.push("not (attributes.managerId pr)");
  }
  if (refresh) {
    const iso = refreshCutoffIso(refresh);
    if (refresh === "older") {
      clauses.push(`modified le "${iso}"`);
    } else {
      clauses.push(`modified gt "${iso}"`);
    }
  }
  return clauses.length > 0 ? clauses.join(" and ") : undefined;
}

const VALID_ACTIVITY_ACTOR_VALUES = new Set<ActivityActorFilterValue>(
  ACTIVITY_ACTOR_OPTIONS.map((o) => o.value),
);
const VALID_ACTIVITY_ACTION_VALUES = new Set<ActivityActionFilterValue>(
  ACTIVITY_ACTION_OPTIONS.map((o) => o.value),
);
const VALID_ACTIVITY_RANGE_VALUES = new Set<ActivityRangeFilterValue>(
  ACTIVITY_RANGE_OPTIONS.map((o) => o.value),
);

function actActorFromParam(
  value: string | undefined,
): ActivityActorFilterValue | null {
  if (!value) return null;
  const v = value.toLowerCase() as ActivityActorFilterValue;
  return VALID_ACTIVITY_ACTOR_VALUES.has(v) ? v : null;
}

function actActionFromParam(
  value: string | undefined,
): ActivityActionFilterValue | null {
  if (!value) return null;
  // Action keys are mixed-case (ISC) and lowercase (app) — preserve case.
  const v = value as ActivityActionFilterValue;
  return VALID_ACTIVITY_ACTION_VALUES.has(v) ? v : null;
}

function actRangeFromParam(
  value: string | undefined,
): ActivityRangeFilterValue | null {
  if (!value) return null;
  const v = value.toLowerCase() as ActivityRangeFilterValue;
  return VALID_ACTIVITY_RANGE_VALUES.has(v) ? v : null;
}

function actLimitFromParam(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return ACTIVITY_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), ACTIVITY_MAX_LIMIT);
}

function actOffsetFromParam(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

const MANAGER_SCHEMA_FIELD_NAMES = new Set<string>(MANAGER_ATTRIBUTE_NAMES);

/**
 * Best-effort detection of `managerId` availability on a source's
 * account schema. Looks for the canonical attribute names — connectors
 * vary in casing/snake-vs-camel, so a small whitelist beats false
 * negatives. Falls back to `false` if no account schema is found.
 *
 * The whitelist is sourced from `MANAGER_ATTRIBUTE_NAMES` in
 * `accounts-filters-shared.ts` so the schema-presence check and the
 * row-level extraction (`extractManagerId`) stay in lockstep.
 */
function detectManagerIdAvailable(
  schemas: ReadonlyArray<{ name: string; attributes: { name: string }[] }>,
): boolean {
  // Look at all schemas — the account schema is typically named
  // "account" but a few connectors name it differently. Checking every
  // attribute on every schema is cheap and avoids brittle naming.
  for (const s of schemas) {
    for (const attr of s.attributes) {
      if (MANAGER_SCHEMA_FIELD_NAMES.has(attr.name.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

function PermissionDenied({ resource }: { resource: string }) {
  return (
    <StateView
      intent="forbidden"
      size="sm"
      title={`No permission to read ${resource}`}
      description="Ask an administrator to grant the corresponding ISC scope on this tenant."
    />
  );
}

function TabFailure({
  status,
  resource,
  message,
}: {
  status: number;
  resource: string;
  message: string;
}) {
  if (status === 403) return <PermissionDenied resource={resource} />;
  return (
    <StateView
      intent="api_error"
      size="sm"
      title={`Couldn't load ${resource}`}
      description={message}
      detail={status > 0 ? String(status) : undefined}
      action={null}
    />
  );
}

function toAccountRow(
  account: SourceAccount,
  entitlementCount: number | null,
) {
  return {
    id: account.id,
    name: account.name ?? null,
    nativeIdentity: account.nativeIdentity ?? null,
    identityId: account.identityId ?? null,
    authoritative: Boolean(account.authoritative),
    disabled: Boolean(account.disabled),
    locked: Boolean(account.locked),
    modified: account.modified ?? null,
    managerId: extractManagerId(account.attributes),
    entitlementCount,
  };
}

function buildHref(
  base: string,
  searchParams: URLSearchParams,
  overrides: Record<string, string | null>,
): string {
  const params = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function SourceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    accpage?: string;
    accper?: string;
    schema?: string;
    accq?: string;
    accstatus?: string;
    accorphan?: string;
    accmgr?: string;
    accrefresh?: string;
    runrange?: string;
    runstatus?: string;
    runtrigger?: string;
    runpage?: string;
    actq?: string;
    actactor?: string;
    actaction?: string;
    actrange?: string;
    actlimit?: string;
    actoffset?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const tab = tabFromParam(sp.tab);
  const accountsPer = accountsPerFromParam(sp.accper);
  const accountsPage = accountsPageFromParam(sp.accpage);
  const schemaParam = (sp.schema ?? "").toLowerCase();
  const accQ = (sp.accq ?? "").trim();
  const accStatus = accStatusFromParam(sp.accstatus);
  const accCorrelation = accCorrelationFromParam(sp.accorphan);
  const accManager = accManagerFromParam(sp.accmgr);
  const accRefresh = accRefreshFromParam(sp.accrefresh);
  const runRange = rangeFromParam(sp.runrange);
  const runStatus = statusFromParam(sp.runstatus);
  const runTrigger = triggerFromParam(sp.runtrigger);
  const runPageRaw = Number(sp.runpage);
  const runPage =
    Number.isFinite(runPageRaw) && runPageRaw >= 1 ? Math.floor(runPageRaw) : 1;
  const actQ = (sp.actq ?? "").trim();
  const actActor = actActorFromParam(sp.actactor);
  const actAction = actActionFromParam(sp.actaction);
  const actRange = actRangeFromParam(sp.actrange);
  const actLimit = actLimitFromParam(sp.actlimit);
  const actOffset = actOffsetFromParam(sp.actoffset);
  const userId = session.user.id;

  const accountsFilterExpr =
    tab === "accounts"
      ? buildAccountsFilter({
          q: accQ,
          status: accStatus,
          correlation: accCorrelation,
          manager: accManager,
          refresh: accRefresh,
        })
      : undefined;

  // Accounts fetch shape depends on the active tab:
  //  - Overview needs a fixed sample (up to OVERVIEW_SAMPLE_SIZE) to
  //    compute KPI percentages.
  //  - Accounts needs the user-selected page slice + total count for
  //    pagination chrome.
  // On Schemas, we still fetch the small sample because the header pill
  // ("N accounts") on the Accounts tab needs the count regardless of
  // which tab is open, and a `count=true&limit=1` request gives us that
  // for free.
  const accountsFetchParams =
    tab === "accounts"
      ? {
          count: true,
          limit: accountsPer,
          offset: (accountsPage - 1) * accountsPer,
          filters: accountsFilterExpr,
        }
      : tab === "overview"
        ? { count: true, limit: OVERVIEW_SAMPLE_SIZE }
        : { count: true, limit: 1 };

  // The 5-stat strip (issue #184) needs a small account sample to compute
  // `correlated · orphans`. The Overview tab already fetches one
  // (OVERVIEW_SAMPLE_SIZE); on other tabs we fetch a separate small sample
  // dedicated to the strip rather than inflate the accounts fetch above —
  // pagination on the Accounts tab and `count=1` on Schemas should stay
  // tight.
  const stripSampleNeeded = tab !== "overview";

  const [
    sourceResult,
    accountsResult,
    schemasResult,
    stripSampleResult,
    entitlementsTotal,
    profilesResult,
  ] = await Promise.all([
    getSource(userId, id),
    getSourceAccounts(userId, id, accountsFetchParams),
    getSourceSchemas(userId, id),
    stripSampleNeeded
      ? getSourceAccounts(userId, id, { count: false, limit: 250 })
      : Promise.resolve(null),
    countEntitlements(userId, { sourceId: id }),
    listIdentityProfiles(userId),
  ]);

  // Schemas tab "Used by" column (issue #264) — scan every transform +
  // identity profile on the tenant for `accountAttribute` references to
  // this source. Done after the parallel block above so we can pass the
  // already-resolved `sourceResult.data.name` (matching predicate is
  // sourceName-based — see source-attribute-consumers.ts). Best-effort:
  // failures degrade to an empty cell, never block the tab.
  const attributeConsumers =
    tab === "schemas" && sourceResult.ok
      ? await getSchemaAttributeConsumers(userId, sourceResult.data.name)
      : undefined;

  // Schemas tab drift compute (issue #265). Capture-and-compare every
  // fetched schema against the libsql baseline; the resulting per-attr
  // map is handed to `<SourceSchemas>` and rendered as a badge column.
  // Best-effort: any DB failure collapses to an empty map (no badges).
  // Skip the compute outside the Schemas tab to save a round-trip on
  // page loads that won't render the badges.
  const schemaDriftByName = new Map<string, SourceSchemaDrift>();
  if (tab === "schemas" && schemasResult.ok) {
    await Promise.all(
      schemasResult.data.map(async (s) => {
        const drift = await safeCaptureAndCompareSchema(
          userId,
          id,
          s.name,
          s.attributes ?? [],
        );
        schemaDriftByName.set(s.name.toLowerCase(), drift);
      }),
    );
  }

  // Provisioning tab (issue #269) — fetch the 3 policies + transforms used
  // on this source in parallel. All three policy calls are best-effort
  // (factory returns `null` on 404), and the transforms walker is
  // best-effort too (empty array on auth failure). None of them should
  // ever block the page.
  //
  // Path caveat: the `getSchemaMappings` / `getCorrelationConfig` ISC paths
  // shipped in PR #288 don't match the public v2025 OpenAPI spec — they're
  // likely `/correlation-config` and `/attribute-sync-config` (experimental,
  // header-gated) instead of the paths used today. #288 returns `null` on
  // 404, so this tab renders cleanly with empty cards while the path fix
  // lands as a follow-up.
  const [schemaMappingsData, correlationConfigData, sourceTransformConsumers] =
    tab === "provisioning" && sourceResult.ok
      ? await Promise.all([
          getSchemaMappings(userId, id).catch(() => null),
          getCorrelationConfig(userId, id).catch(() => null),
          getSourceTransformConsumers(userId, sourceResult.data.name),
        ])
      : [null, null, [] as Awaited<
          ReturnType<typeof getSourceTransformConsumers>
        >];

  // Aggregations tab (issue #268) — lazy fetch when active.
  const aggregationRuns: AggregationRun[] =
    tab === "aggregations" && sourceResult.ok
      ? await listAggregationRuns(userId, {
          sourceId: id,
          range: runRange,
          status: runStatus ? [runStatus] : undefined,
          trigger: runTrigger ? [runTrigger] : undefined,
        }).catch(() => [])
      : [];

  // Activity tab (issue #270) — lazy fetch when active. Errors swallow
  // to `{ entries: [] }` so backend hiccups don't block the other tabs.
  const activityResult =
    tab === "activity" && sourceResult.ok
      ? await (async () => {
          const filters: ListSourceActivityFilters = {
            limit: actLimit,
            offset: actOffset,
          };
          if (actQ) filters.search = actQ;
          if (actActor) filters.actor = actActor;
          if (actAction) filters.actionType = actAction;
          if (actRange && actRange !== "all") {
            const fromIso = activityRangeCutoffIso(actRange);
            if (fromIso) filters.from = fromIso;
          }
          try {
            return await listSourceActivity(userId, id, filters);
          } catch {
            return { entries: [] };
          }
        })()
      : null;

  if (!sourceResult.ok) {
    if (sourceResult.status === 404) notFound();
    return (
      <DetailShell
        back={{ href: "/sailpoint/sources", label: "All sources" }}
        header={null}
      >
        {sourceResult.status === 403 ? (
          <PermissionDenied resource="this source" />
        ) : (
          <StateView
            intent={
              sourceResult.status === 0
                ? "not_connected"
                : sourceResult.status === 401
                  ? "auth_failed"
                  : "api_error"
            }
            title={
              sourceResult.status === 0
                ? "Connect your SailPoint tenant"
                : sourceResult.status === 401
                  ? "SailPoint session expired"
                  : "SailPoint API error"
            }
            description={
              sourceResult.status === 0
                ? "Sign in with SailPoint to load this source from your tenant."
                : sourceResult.status === 401
                  ? "Your access to SailPoint was revoked or has expired. Sign in again to continue."
                  : "The request failed. Try again, or contact your administrator if it persists."
            }
            detail={
              sourceResult.status >= 400
                ? `${sourceResult.status} ${sourceResult.message}`
                : undefined
            }
          />
        )}
      </DetailShell>
    );
  }

  const accountsTotal = accountsResult.ok ? (accountsResult.total ?? null) : null;
  const accountsData = accountsResult.ok ? accountsResult.data : [];

  // Per-account entitlement counts (issue #261) — ISC v2025 doesn't embed
  // an entitlement count or list on `/v2025/accounts/{id}`, so we fetch
  // them in parallel only for the rows the user is about to see. Scoped
  // to `tab === "accounts"` to keep the Overview / Schemas tabs free of
  // N+1 traffic they don't display. Each count is best-effort and
  // independently nullable — one slow response can't take the table
  // down. Cap at the visible page slice (≤ 250).
  const entitlementCountsByAccountId = new Map<string, number | null>();
  if (tab === "accounts" && accountsData.length > 0) {
    const settled = await Promise.all(
      accountsData.map(async (a) => {
        const n = await countAccountEntitlements(userId, a.id);
        return [a.id, n ?? null] as const;
      }),
    );
    for (const [aid, n] of settled) {
      entitlementCountsByAccountId.set(aid, n);
    }
  }

  // Stat strip inputs (issue #184). On Overview we reuse the bigger sample
  // already fetched above. On other tabs we use the dedicated strip sample
  // (or fall back to whatever the tab fetch returned, which may be empty).
  const stripSampleAccounts =
    tab === "overview"
      ? accountsData
      : stripSampleResult && stripSampleResult.ok
        ? stripSampleResult.data
        : [];

  // Resolve identity profile by local match on `authoritativeSource.id`.
  // `/v2025/identities/{id}` doesn't embed the profile — same constraint
  // applies to `/v2025/sources/{id}`. The list endpoint is the only path.
  const matchedProfile =
    profilesResult.ok
      ? (profilesResult.data.find(
          (p) => p.authoritativeSource?.id === id,
        ) ?? null)
      : null;
  const identityProfileName = matchedProfile?.name ?? null;
  // Full identity profile object for the Overview side card. The list
  // endpoint exposes only the summary, so `lifecycleStatesCount` /
  // `defaultState` / `identitiesCount` are unknown until a richer fetch
  // is wired (left as `null` so the card renders `—` rather than a count
  // we can't justify).
  const identityProfileForOverview = matchedProfile
    ? {
        id: matchedProfile.id,
        name: matchedProfile.name,
        identitiesCount: null,
        lifecycleStatesCount: null,
        defaultState: null,
      }
    : null;

  // Provisioning tab — Create identity rule card props. The
  // /v2025/identity-profiles list endpoint embeds the full
  // identityAttributeConfig (same shape relied on by the Schemas "Used by"
  // walk), so the transforms count can be derived in-place without a
  // per-profile fetch. Widened to read the deeper config because
  // IdentityProfileSummary doesn't expose it.
  const identityProfileForProvisioning =
    matchedProfile
      ? {
          id: matchedProfile.id,
          name: matchedProfile.name,
          attributeTransformsCount:
            (matchedProfile as unknown as {
              identityAttributeConfig?: {
                attributeTransforms?: unknown[];
              };
            }).identityAttributeConfig?.attributeTransforms?.length ?? null,
        }
      : null;

  const scheduleLabel = sourceResult.ok
    ? parseScheduleFromConnectorAttributes(
        sourceResult.data.connectorAttributes,
      )
    : null;

  const currentSearchParams = new URLSearchParams();
  if (tab !== "overview") currentSearchParams.set("tab", tab);
  if (tab === "accounts") {
    if (accountsPage > 1)
      currentSearchParams.set("accpage", String(accountsPage));
    if (accountsPer !== DEFAULT_ACCOUNTS_PER)
      currentSearchParams.set("accper", String(accountsPer));
    if (accQ) currentSearchParams.set("accq", accQ);
    if (accStatus) currentSearchParams.set("accstatus", accStatus);
    if (accCorrelation) currentSearchParams.set("accorphan", accCorrelation);
    if (accManager) currentSearchParams.set("accmgr", accManager);
    if (accRefresh) currentSearchParams.set("accrefresh", accRefresh);
  }
  if (tab === "aggregations") {
    if (runRange !== DEFAULT_RANGE)
      currentSearchParams.set("runrange", runRange);
    if (runStatus) currentSearchParams.set("runstatus", runStatus);
    if (runTrigger) currentSearchParams.set("runtrigger", runTrigger);
    if (runPage > 1) currentSearchParams.set("runpage", String(runPage));
  }
  if (tab === "activity") {
    if (actQ) currentSearchParams.set("actq", actQ);
    if (actActor) currentSearchParams.set("actactor", actActor);
    if (actAction) currentSearchParams.set("actaction", actAction);
    if (actRange) currentSearchParams.set("actrange", actRange);
    if (actLimit !== ACTIVITY_DEFAULT_LIMIT)
      currentSearchParams.set("actlimit", String(actLimit));
    if (actOffset > 0) currentSearchParams.set("actoffset", String(actOffset));
  }

  const basePath = `/sailpoint/sources/${encodeURIComponent(id)}`;

  // Best-effort check: does the source's account schema declare a
  // `managerId` attribute? When absent, the Manager filter renders
  // disabled with a tooltip. Schemas may fail to load (403/etc) — in
  // that case fall back to `false` and leave the dropdown disabled
  // rather than offering a filter that's likely to return nothing.
  const managerIdAvailable = schemasResult.ok
    ? detectManagerIdAvailable(schemasResult.data)
    : false;

  const hasAnyAccountsFilter = Boolean(
    accQ || accStatus || accCorrelation || accManager || accRefresh,
  );

  const hasAnyActivityFilter = Boolean(actQ || actActor || actAction || actRange);

  // Clear-filters link for the Activity tab — keep the `tab` param, drop
  // every act-scoped filter + the offset cursor.
  const clearActivityFiltersHref = (() => {
    const params = new URLSearchParams();
    params.set("tab", "activity");
    if (actLimit !== ACTIVITY_DEFAULT_LIMIT)
      params.set("actlimit", String(actLimit));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  })();

  // "Load more" cursor — bump `actoffset` by the current limit. We never
  // render the link if the current page came back short (< limit) since
  // there's nothing left to fetch. The factory cursor encoding lives
  // server-side per ADR D3; from the UI's perspective offset is enough.
  const activityLoadMoreHref =
    activityResult && activityResult.entries.length >= actLimit
      ? (() => {
          const params = new URLSearchParams(currentSearchParams.toString());
          params.set("actoffset", String(actOffset + actLimit));
          const qs = params.toString();
          return qs ? `${basePath}?${qs}` : basePath;
        })()
      : null;

  // Clear-filters link: keep the `tab` param so we stay on the Accounts
  // tab, drop every account-scoped filter + the paginator page.
  const clearAccountsFiltersHref = (() => {
    const params = new URLSearchParams();
    params.set("tab", "accounts");
    if (accountsPer !== DEFAULT_ACCOUNTS_PER)
      params.set("accper", String(accountsPer));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  })();

  const hasAnyAggregationsFilter = Boolean(
    runRange !== DEFAULT_RANGE || runStatus || runTrigger,
  );

  // Clear-filters link for the Aggregations tab — keep the `tab` param,
  // drop every run-scoped filter + the paginator page.
  const clearAggregationsFiltersHref = (() => {
    const params = new URLSearchParams();
    params.set("tab", "aggregations");
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  })();

  // Best-effort "is an aggregation in flight" derived from the source's
  // own `status` string — no extra round-trip. Disables the
  // Aggregate-now button to keep the UI honest, even though ISC
  // server-side rejects concurrent aggregations anyway.
  const isAggregating = isAggregationRunning({
    sourceId: id,
    healthy: sourceResult.data.healthy,
    status: sourceResult.data.status,
    since: sourceResult.data.since,
  });

  return (
    <DetailShell
      back={{ href: "/sailpoint/sources", label: "All sources" }}
      header={
        <SourceDetailHeader
          source={sourceResult.data}
          isAggregating={isAggregating}
        />
      }
      stats={
        <SourceStatStrip
          accountsTotal={accountsTotal}
          sampleAccounts={stripSampleAccounts}
          entitlementsTotal={entitlementsTotal}
          since={sourceResult.data.since ?? null}
          healthy={sourceResult.data.healthy ?? null}
          status={sourceResult.data.status ?? null}
          scheduleLabel={scheduleLabel}
          identityProfileName={identityProfileName}
          identityProfileId={matchedProfile?.id ?? null}
        />
      }
      tabs={
        <Tabs
          size="md"
          value={tab}
          hrefFor={(k) =>
            k === "overview" ? basePath : `${basePath}?tab=${k}`
          }
          aria-label="Source sections"
          items={[
            { key: "overview", label: "Overview" },
            { key: "accounts", label: "Accounts", count: accountsTotal },
            {
              key: "schemas",
              label: "Schemas",
              count: schemasResult.ok ? schemasResult.data.length : null,
            },
            { key: "provisioning", label: "Provisioning" },
            { key: "aggregations", label: "Aggregations" },
            { key: "activity", label: "Activity" },
          ]}
        />
      }
    >
      {tab === "overview" && (
        <SourceOverview
          source={sourceResult.data}
          identityProfile={identityProfileForOverview}
        />
      )}

      {tab === "accounts" &&
        (accountsResult.ok ? (
          <div className="space-y-4">
            <FilterBar
              search={<AccountsSearchBox initial={accQ} />}
              clearHref={
                hasAnyAccountsFilter ? clearAccountsFiltersHref : undefined
              }
              filters={
                <>
                  <AccountsStatusFilter selected={accStatus} />
                  <AccountsCorrelationFilter selected={accCorrelation} />
                  <AccountsManagerFilter
                    selected={accManager}
                    available={managerIdAvailable}
                  />
                  <AccountsRefreshFilter selected={accRefresh} />
                </>
              }
            />
            <SourceAccountsTable
              data={accountsData.map((a) =>
                toAccountRow(
                  a,
                  entitlementCountsByAccountId.get(a.id) ?? null,
                ),
              )}
              sourceId={id}
              emptyState={
                hasAnyAccountsFilter
                  ? "No accounts match the current filters."
                  : undefined
              }
            />
            <Pagination
              page={accountsPage}
              totalPages={Math.max(
                1,
                Math.ceil((accountsTotal ?? accountsData.length) / accountsPer),
              )}
              total={accountsTotal ?? accountsData.length}
              rangeStart={
                accountsData.length === 0
                  ? 0
                  : (accountsPage - 1) * accountsPer + 1
              }
              rangeEnd={Math.min(
                (accountsPage - 1) * accountsPer + accountsData.length,
                accountsTotal ?? accountsData.length,
              )}
              perPage={accountsPer}
              perPageOptions={ACCOUNTS_PAGE_SIZES}
              hrefForPage={(p) =>
                buildHref(basePath, currentSearchParams, {
                  accpage: p === 1 ? null : String(p),
                })
              }
              hrefForPerPage={(n) =>
                buildHref(basePath, currentSearchParams, {
                  accpage: null,
                  accper: n === DEFAULT_ACCOUNTS_PER ? null : String(n),
                })
              }
            />
          </div>
        ) : (
          <TabFailure
            status={accountsResult.status}
            resource="accounts"
            message={accountsResult.message}
          />
        ))}

      {tab === "schemas" &&
        (schemasResult.ok ? (
          <SourceSchemas
            sourceId={id}
            schemas={schemasResult.data}
            activeSchema={schemaParam}
            hrefForSchema={(name) =>
              buildHref(basePath, currentSearchParams, {
                tab: "schemas",
                schema: name,
              })
            }
            attributeConsumers={attributeConsumers}
            attributeDriftByName={schemaDriftByName}
          />
        ) : (
          <TabFailure
            status={schemasResult.status}
            resource="schemas"
            message={schemasResult.message}
          />
        ))}

      {tab === "provisioning" && (
        <SourceProvisioningTab
          source={sourceResult.data}
          schemaMappings={schemaMappingsData}
          identityProfile={identityProfileForProvisioning}
          correlationConfig={correlationConfigData}
          transformConsumers={sourceTransformConsumers}
        />
      )}

      {tab === "aggregations" && (
        <SourceAggregationsTab
          sourceId={id}
          runs={aggregationRuns}
          range={runRange}
          status={runStatus}
          trigger={runTrigger}
          page={runPage}
          hasAnyFilter={hasAnyAggregationsFilter}
          clearFiltersHref={clearAggregationsFiltersHref}
          pageHrefFor={(p) =>
            buildHref(basePath, currentSearchParams, {
              runpage: p === 1 ? null : String(p),
            })
          }
        />
      )}
      {tab === "activity" && activityResult && (
        <SourceActivityTab
          result={activityResult}
          filters={{
            q: actQ,
            actor: actActor,
            action: actAction,
            range: actRange,
          }}
          basePath={basePath}
          hasAnyFilter={hasAnyActivityFilter}
          clearFiltersHref={clearActivityFiltersHref}
          loadMoreHref={activityLoadMoreHref}
          currentTotal={actLimit}
        />
      )}
    </DetailShell>
  );
}
