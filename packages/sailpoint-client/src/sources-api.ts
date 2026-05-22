import {
  sailpointCount,
  sailpointFetch,
  type SailpointClientOptions,
  type SailpointFetchError,
} from "./client";
import type { IdentityAccount } from "./identities-api";

/**
 * Sources API factory (v0).
 *
 * Six pure functions covering the read surface needed by the admin
 * Sources list + detail experience, plus the single write action
 * (`triggerAggregation`). Mirrors the shape of `identities-api.ts`:
 *  - takes `SailpointClientOptions` explicitly (no DB / no auth state),
 *  - returns discriminated `{ ok }` results with `status` on failure so
 *    callers can branch on 403 without parsing a generic Error.
 *
 * Type coverage is deliberately narrow: only the fields consumers actually
 * read are typed. `connectorAttributes` and `configuration` stay as
 * `Record<string, unknown>` — the schema varies per connector and
 * pretending otherwise would rot fast.
 */

export type SourceRef = {
  id: string;
  name: string;
  type?: string;
};

export type SourceSummary = {
  id: string;
  name: string;
  description?: string | null;
  /** ISC source kind (e.g. `OpenConnector`, `DelimitedFile`). */
  type?: string | null;
  /** Internal connector identifier (e.g. `active-directory`). */
  connector?: string | null;
  /** Human label for the connector (e.g. `Active Directory`). */
  connectorName?: string | null;
  connectorClass?: string | null;
  category?: string | null;
  authoritative?: boolean;
  /**
   * Embedded health snapshot from `/v2025/sources/{id}`. These flip on the
   * source object itself, not via a separate health endpoint — querying
   * `/beta/sources/{id}/health` returns the same values.
   */
  healthy?: boolean;
  status?: string | null;
  /** Timestamp at which the current `status` / `healthy` was set. */
  since?: string | null;
  features?: string[];
  cluster?: SourceRef | null;
  owner?: SourceRef | null;
  managerRef?: SourceRef | null;
  created?: string;
  modified?: string;
};

export type SourceDetail = SourceSummary & {
  /**
   * Connector-specific config bag. Shape is per-connector; consumers cast
   * at the point of use rather than declaring an exhaustive union.
   */
  connectorAttributes?: Record<string, unknown>;
  accountCorrelationConfig?: SourceRef | null;
  managerCorrelationRule?: SourceRef | null;
  beforeProvisioningRule?: SourceRef | null;
  /** Schema refs declared on the source (account + group + any custom). */
  schemas?: SourceRef[];
};

export type SourceSchemaAttribute = {
  name: string;
  type: string;
  isMulti?: boolean;
  isEntitlement?: boolean;
  isGroup?: boolean;
  description?: string | null;
  /** Reference to another schema on the same source (for nested types). */
  schema?: SourceRef | null;
};

/**
 * Schema returned by `GET /v2025/sources/{id}/schemas`. Source of truth for
 * the field list of accounts on this source — `account.attributes` can
 * carry legacy residues that aren't declared here.
 */
export type SourceSchema = {
  id: string;
  name: string;
  nativeObjectType?: string | null;
  identityAttribute?: string | null;
  displayAttribute?: string | null;
  hierarchyAttribute?: string | null;
  includePermissions?: boolean;
  features?: string[];
  configuration?: Record<string, unknown> | null;
  attributes: SourceSchemaAttribute[];
  created?: string;
  modified?: string;
};

/**
 * Account on a source. Same shape as `IdentityAccount` — both come from
 * `/v2025/accounts` (just filtered differently). Aliased rather than
 * redeclared so the two stay in lockstep.
 */
export type SourceAccount = IdentityAccount;

/**
 * Best-effort snapshot of the source's current aggregation health. Derived
 * from `GET /v2025/sources/{id}` because ISC doesn't expose a dedicated
 * per-source aggregation-status endpoint in v2025 — task / event history
 * would need an events-index search, which is out of scope for v0.
 *
 * Consumers that need a richer "last 5 runs" view should query the events
 * index directly.
 */
export type SourceAggregationStatus = {
  sourceId: string;
  healthy?: boolean;
  status?: string | null;
  since?: string | null;
};

export type ListSourcesParams = {
  limit?: number;
  offset?: number;
  /** SailPoint SCIM-like filter expression (e.g. `name co "ad"`). */
  filters?: string;
  /** SailPoint sorters expression (e.g. `name` or `-modified`). */
  sorters?: string;
  /** Request `X-Total-Count` header for pagination. Defaults to false. */
  count?: boolean;
};

export type GetSourceAccountsParams = {
  limit?: number;
  offset?: number;
  /**
   * Extra filter AND'd onto the source scope. The source filter
   * (`sourceId eq "..."`) is built automatically by `getSourceAccounts`.
   */
  filters?: string;
  /** Request `X-Total-Count` header for pagination. Defaults to false. */
  count?: boolean;
};

export type AggregationType = "accounts" | "entitlements";

export type TriggerAggregationParams = {
  type: AggregationType;
  /**
   * Force a full re-pull, bypassing the delta optimization. Maps to the
   * `disableOptimization=true` query param ISC exposes on the load
   * endpoints. Defaults to undefined (let ISC pick).
   */
  disableOptimization?: boolean;
};

export type TriggerAggregationResult =
  | { ok: true; taskId?: string }
  | { ok: false; status: number; message: string };

/**
 * Result of a per-account bulk action (recorrelate / disable / refresh).
 *
 * ISC v2025 only exposes per-account mutation endpoints on `/v2025/accounts`
 * (no bulk variant takes a list of account ids), so callers fan out one
 * request per input id. The result preserves input order and reports
 * per-id success or failure — a single failing id never poisons the whole
 * batch.
 *
 * `taskId` may be undefined when ISC returns a 202 without a recognisable
 * task descriptor; treat it as "fired off, can't poll status".
 */
export type AccountActionItemResult =
  | { ok: true; accountId: string; taskId?: string }
  | { ok: false; accountId: string; status: number; message: string };

/**
 * Result of a per-account bulk action across many ids. Always exposes
 * `taskIds` (positional, undefined per slot when no descriptor was
 * returned) for the simple consumer path; `results` keeps the detailed
 * per-id outcome for UIs that want to display partial failures.
 */
export type BulkAccountActionResult = {
  taskIds: Array<string | undefined>;
  results: AccountActionItemResult[];
};

/**
 * Result shapes — duplicated locally (mirrors identities-api / transforms-api)
 * so the module stays self-contained. `status` surfaces so callers can
 * branch on 403 without parsing a generic Error.
 */
export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export type ListResult<T> =
  | { ok: true; data: T[]; total?: number }
  | { ok: false; status: number; message: string };

const NOT_CONNECTED_MESSAGE =
  "Not connected to SailPoint. Sign in again or check the tenant configuration.";

function mapError(err: SailpointFetchError): {
  ok: false;
  status: number;
  message: string;
} {
  if (err.kind === "not_connected") {
    return { ok: false, status: 0, message: NOT_CONNECTED_MESSAGE };
  }
  if (err.kind === "auth_failed") {
    return {
      ok: false,
      status: 401,
      message: "SailPoint rejected the access token. Sign in again.",
    };
  }
  return { ok: false, status: err.status, message: err.message };
}

function buildSourcesQuery(params: ListSourcesParams): string {
  const sp = new URLSearchParams();
  if (params.limit !== undefined) sp.set("limit", String(params.limit));
  if (params.offset !== undefined) sp.set("offset", String(params.offset));
  if (params.filters) sp.set("filters", params.filters);
  if (params.sorters) sp.set("sorters", params.sorters);
  if (params.count) sp.set("count", "true");
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function buildAccountsQuery(
  sourceId: string,
  params: GetSourceAccountsParams,
): string {
  const escaped = sourceId.replace(/"/g, '\\"');
  const sourceFilter = `sourceId eq "${escaped}"`;
  const filters = params.filters
    ? `${sourceFilter} and ${params.filters}`
    : sourceFilter;
  const sp = new URLSearchParams();
  sp.set("filters", filters);
  sp.set("limit", String(params.limit ?? 250));
  if (params.offset !== undefined) sp.set("offset", String(params.offset));
  if (params.count) sp.set("count", "true");
  return `?${sp.toString()}`;
}

/**
 * Header-aware list fetch — needed when the caller wants `X-Total-Count`,
 * which `sailpointFetch` swallows. Returns the parsed array plus `total`
 * when the header is present.
 */
async function fetchListWithCount<T>(
  opts: SailpointClientOptions,
  path: string,
): Promise<ListResult<T>> {
  const res = await fetch(`${opts.baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    return {
      ok: false,
      status: 401,
      message: "SailPoint rejected the access token. Sign in again.",
    };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: text || res.statusText };
  }

  const totalHeader = res.headers.get("x-total-count");
  const total =
    totalHeader && !Number.isNaN(Number(totalHeader))
      ? Number(totalHeader)
      : undefined;

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return { ok: true, data: [], total };
  }

  try {
    const data = (await res.json()) as T[];
    return { ok: true, data, total };
  } catch (e) {
    return {
      ok: false,
      status: res.status,
      message: `Couldn't parse SailPoint response: ${(e as Error).message}`,
    };
  }
}

/**
 * `GET /v2025/sources` — list page + filters.
 */
export async function listSources(
  opts: SailpointClientOptions,
  params: ListSourcesParams = {},
): Promise<ListResult<SourceSummary>> {
  const path = `/v2025/sources${buildSourcesQuery(params)}`;

  if (!params.count) {
    const result = await sailpointFetch<SourceSummary[]>(opts, path);
    if (!result.ok) return mapError(result.error);
    return { ok: true, data: result.data };
  }
  return fetchListWithCount<SourceSummary>(opts, path);
}

/**
 * `GET /v2025/sources/{id}` — detail header + Overview tab.
 */
export async function getSource(
  opts: SailpointClientOptions,
  id: string,
): Promise<FetchResult<SourceDetail>> {
  const result = await sailpointFetch<SourceDetail>(
    opts,
    `/v2025/sources/${encodeURIComponent(id)}`,
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, data: result.data };
}

/**
 * `GET /v2025/sources/{id}/schemas` — Schemas tab.
 *
 * Returns every schema declared on the source (typically `account` + `group`,
 * plus any connector-specific extras). This is the source of truth for the
 * field list — `account.attributes` may carry legacy residues that aren't
 * declared here.
 */
export async function getSourceSchemas(
  opts: SailpointClientOptions,
  id: string,
): Promise<FetchResult<SourceSchema[]>> {
  const result = await sailpointFetch<SourceSchema[]>(
    opts,
    `/v2025/sources/${encodeURIComponent(id)}/schemas`,
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, data: result.data };
}

/**
 * `GET /v2025/accounts?filters=sourceId eq "{id}"` — Accounts tab.
 *
 * The v2025 accounts list endpoint takes its source-scope via the
 * `filters` query param (SCIM-like), not via a top-level `sourceId`
 * query param. We build the filter here so consumers don't have to know,
 * and AND any caller-provided `filters` onto it.
 */
export async function getSourceAccounts(
  opts: SailpointClientOptions,
  id: string,
  params: GetSourceAccountsParams = {},
): Promise<ListResult<SourceAccount>> {
  const path = `/v2025/accounts${buildAccountsQuery(id, params)}`;

  if (!params.count) {
    const result = await sailpointFetch<SourceAccount[]>(opts, path);
    if (!result.ok) return mapError(result.error);
    return { ok: true, data: result.data };
  }
  return fetchListWithCount<SourceAccount>(opts, path);
}

/**
 * Best-effort aggregation health.
 *
 * Derived from `GET /v2025/sources/{id}` because ISC doesn't expose a
 * dedicated per-source aggregation-status endpoint in v2025. Returns
 * `healthy`, `status`, and `since` straight from the source payload.
 *
 * Consumers needing a "last 5 runs" history should query the events index
 * (`POST /v2025/search` against `indices=["events"]` with
 * `action:AGGREGATE AND target.id:"{id}"`). Out of scope for v0.
 */
export async function getSourceAggregationStatus(
  opts: SailpointClientOptions,
  id: string,
): Promise<FetchResult<SourceAggregationStatus>> {
  const result = await getSource(opts, id);
  if (!result.ok) return result;
  const { healthy, status, since } = result.data;
  return {
    ok: true,
    data: { sourceId: id, healthy, status, since },
  };
}

/**
 * `POST /v2025/sources/{id}/load-accounts` (or `load-entitlements`).
 *
 * Triggers an aggregation. Returns 202 Accepted with a task descriptor in
 * the common case; we surface `taskId` when present so callers can poll
 * task status. The endpoint accepts `disableOptimization=true` to force
 * a full re-pull (bypasses delta).
 */
export async function triggerAggregation(
  opts: SailpointClientOptions,
  id: string,
  params: TriggerAggregationParams,
): Promise<TriggerAggregationResult> {
  const endpoint =
    params.type === "entitlements" ? "load-entitlements" : "load-accounts";
  const sp = new URLSearchParams();
  if (params.disableOptimization) sp.set("disableOptimization", "true");
  const qs = sp.toString();
  const path =
    `/v2025/sources/${encodeURIComponent(id)}/${endpoint}` +
    (qs ? `?${qs}` : "");

  const result = await sailpointFetch<unknown>(opts, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!result.ok) {
    const m = mapError(result.error);
    return { ok: false, status: m.status, message: m.message };
  }
  return { ok: true, taskId: extractTaskId(result.data) };
}

/**
 * Best-effort global account count, optionally narrowed by `filters`.
 *
 * Powers KPI cards on the Sources list (e.g. orphan accounts across the
 * whole tenant via `filters=uncorrelated eq true`). Returns `undefined`
 * on any failure so callers can render a "—" cell rather than poison
 * the strip with an error state.
 */
export async function countAccounts(
  opts: SailpointClientOptions,
  params: { filters?: string } = {},
): Promise<number | undefined> {
  const sp = new URLSearchParams();
  if (params.filters) sp.set("filters", params.filters);
  const qs = sp.toString();
  return sailpointCount(opts, `/v2025/accounts${qs ? `?${qs}` : ""}`);
}

/**
 * Entitlement count for a single source.
 *
 * Powers the Entitlements KPI on the Source detail 5-stat strip. Always
 * returns a `number` — failures (auth, network, 404, missing header,
 * non-2xx) collapse to `0` so the cell renders a value rather than poison
 * the strip with an error state. Use a dedicated health probe if you need
 * to distinguish "zero entitlements" from "couldn't ask".
 *
 * Issues a single `GET /v2025/entitlements?filters=source.id eq "{id}"
 * &count=true&limit=1` and reads the `X-Total-Count` response header via
 * the shared `sailpointCount` helper.
 */
export async function countEntitlements(
  opts: SailpointClientOptions,
  params: { sourceId: string },
): Promise<number> {
  const escaped = params.sourceId.replace(/"/g, '\\"');
  const sp = new URLSearchParams();
  sp.set("filters", `source.id eq "${escaped}"`);
  const total = await sailpointCount(
    opts,
    `/v2025/entitlements?${sp.toString()}`,
  );
  return total ?? 0;
}

/**
 * Maximum parallel ISC requests when fanning out a per-account action.
 *
 * ISC enforces tenant-level rate limits (default ≈ 25 requests/sec on
 * non-search endpoints). A small ceiling keeps us well under that and
 * prevents one Recorrelate-1000-accounts click from starving the rest of
 * the app of API budget.
 */
const ACCOUNT_ACTION_CONCURRENCY = 5;

/**
 * Fan out a per-account POST action with bounded parallelism.
 *
 * ISC v2025 does not expose a bulk endpoint that takes a list of account
 * ids for reload / disable / refresh — the only "bulk for accounts"
 * variants (`POST /identities-accounts/{enable,disable}`) operate on
 * identity ids, not account ids. So we issue N parallel requests, one per
 * input id, and collect per-id outcomes.
 *
 * Empty input throws — callers should validate selection before invoking.
 */
async function runAccountAction(
  opts: SailpointClientOptions,
  ids: string[],
  endpointSuffix: "reload" | "disable",
  emptyMessage: string,
): Promise<BulkAccountActionResult> {
  if (ids.length === 0) throw new Error(emptyMessage);

  const results = new Array<AccountActionItemResult>(ids.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= ids.length) return;
      const id = ids[i];
      const result = await sailpointFetch<unknown>(
        opts,
        `/v2025/accounts/${encodeURIComponent(id)}/${endpointSuffix}`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      if (!result.ok) {
        const m = mapError(result.error);
        results[i] = {
          ok: false,
          accountId: id,
          status: m.status,
          message: m.message,
        };
      } else {
        results[i] = {
          ok: true,
          accountId: id,
          taskId: extractTaskId(result.data),
        };
      }
    }
  }

  const workerCount = Math.min(ACCOUNT_ACTION_CONCURRENCY, ids.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const taskIds = results.map((r) => (r.ok ? r.taskId : undefined));
  return { taskIds, results };
}

/**
 * Re-correlate accounts against the identity graph.
 *
 * Issues `POST /v2025/accounts/{id}/reload` per id (ISC v2025 has no bulk
 * accounts-by-id endpoint). The reload endpoint asynchronously reloads
 * the account directly from the connector and re-runs correlation —
 * use it to recover orphan accounts after fixing correlation config.
 *
 * Partial success is allowed: per-id failures land in `results[i]`
 * without aborting the batch.
 */
export async function recorrelateAccounts(
  opts: SailpointClientOptions,
  ids: string[],
): Promise<BulkAccountActionResult> {
  return runAccountAction(
    opts,
    ids,
    "reload",
    "No accounts selected for re-correlation.",
  );
}

/**
 * Disable accounts on their source.
 *
 * Issues `POST /v2025/accounts/{id}/disable` per id. The endpoint
 * submits a task per account and returns 202 with a task descriptor.
 * The bulk variant (`POST /identities-accounts/disable`) only works
 * when keyed by identity id, not account id — irrelevant for the
 * Sources accounts table where the selection is account ids.
 *
 * Partial success is allowed: per-id failures land in `results[i]`
 * without aborting the batch.
 */
export async function disableAccounts(
  opts: SailpointClientOptions,
  ids: string[],
): Promise<BulkAccountActionResult> {
  return runAccountAction(
    opts,
    ids,
    "disable",
    "No accounts selected to disable.",
  );
}

/**
 * Refresh accounts directly from their connector source.
 *
 * Same ISC endpoint as re-correlate (`POST /v2025/accounts/{id}/reload`):
 * the v2025 spec describes it as "asynchronously reload the account
 * directly from the connector and perform a one-time aggregation". The
 * factory exposes this as a distinct function so UI surfaces can label
 * the action by user intent (correlation fix vs single-account
 * re-aggregation) without callers needing to know they hit the same
 * endpoint.
 *
 * Partial success is allowed: per-id failures land in `results[i]`
 * without aborting the batch.
 */
export async function refreshAccountsFromSource(
  opts: SailpointClientOptions,
  ids: string[],
): Promise<BulkAccountActionResult> {
  return runAccountAction(
    opts,
    ids,
    "reload",
    "No accounts selected to refresh.",
  );
}

/**
 * Best-effort entitlement count for a single account.
 *
 * Powers the per-row Entitlements column on the Accounts tab of the Source
 * detail page. ISC v2025 does NOT embed an entitlement count or entitlements
 * list on the `/v2025/accounts/{id}` payload, so we hit the dedicated
 * `/v2025/accounts/{id}/entitlements` endpoint with `count=true&limit=1`
 * and read the total off `X-Total-Count`.
 *
 * Returns `undefined` on any failure (auth, network, missing header, non-2xx)
 * so the cell can render an em-dash rather than block the table. Returns
 * `0` (not `undefined`) when the account legitimately has no entitlements —
 * `sailpointCount` falls back to `data.length` when the header is missing.
 *
 * Per-row N+1 — callers should `Promise.all` over the visible page slice
 * rather than waterfall. Acceptable up to the table page size cap (250).
 */
export async function countAccountEntitlements(
  opts: SailpointClientOptions,
  accountId: string,
): Promise<number | undefined> {
  return sailpointCount(
    opts,
    `/v2025/accounts/${encodeURIComponent(accountId)}/entitlements`,
  );
}

/**
 * The load endpoints return shapes that vary by ISC version: sometimes
 * `{ task: { id } }`, sometimes `{ id }`, sometimes `{ taskId }`, sometimes
 * an empty 202. Lenient extraction keeps the contract stable.
 */
function extractTaskId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.taskId === "string") return obj.taskId;
  if (typeof obj.id === "string") return obj.id;
  const task = obj.task;
  if (task && typeof task === "object" && "id" in task) {
    const id = (task as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  return undefined;
}

/**
 * Per-source schema mapping entry — pairs an account-schema attribute with
 * its provisioning target. Permissive shape: the v2025 public spec doesn't
 * document this endpoint under this path, and the response varies by
 * connector, so we expose the fields the Provisioning tab actually reads
 * plus a passthrough for the rest.
 */
export type SchemaMappingEntry = {
  /** Account attribute name on the source schema. */
  name?: string;
  /** Display label for the attribute (when the connector provides one). */
  displayName?: string | null;
  /** Target identity attribute name, when mapped. */
  target?: string | null;
  /** Source attribute the target is mapped from, when set. */
  source?: string | null;
  /** Whether the mapping is currently enabled. */
  enabled?: boolean;
  /** Whether the attribute is required by the provisioning policy. */
  required?: boolean;
  /** Connector-extra fields surface here. */
  [key: string]: unknown;
};

/**
 * Schema-mappings payload returned by
 * `GET /v2025/sources/{id}/accounts/schema-mappings`.
 *
 * Permissive top-level shape — `attributes` carries the per-attribute
 * mapping list (the field name most ISC connectors use), and the rest is
 * passthrough so we don't fight the connector-specific extras.
 */
export type SchemaMappings = {
  id?: string;
  name?: string | null;
  /** Reference to the source the mappings apply to, when echoed back. */
  source?: SourceRef | null;
  /** Per-attribute mappings — primary payload consumers iterate over. */
  attributes?: SchemaMappingEntry[];
  /** Connector-extra fields surface here. */
  [key: string]: unknown;
};

/**
 * Single attribute-assignment row in a correlation config (mirrors the
 * `CorrelationConfig.attributeAssignments[]` shape in the v2025 spec).
 */
export type CorrelationAttributeAssignment = {
  /** Account attribute property name (left-hand side of the match rule). */
  property?: string;
  /** Identity attribute the property is matched against. */
  value?: string;
  /** Match operation — ISC currently only emits `EQ`. */
  operation?: "EQ" | string;
  /** Whether this is a complex (multi-step) assignment. */
  complex?: boolean;
  /** Whether the comparison ignores case. */
  ignoreCase?: boolean;
  /** Substring match mode for non-exact matches. */
  matchMode?: "ANYWHERE" | "START" | "END" | string;
  /** Filter expression (when complex). */
  filterString?: string;
};

/**
 * Source correlation configuration returned by
 * `GET /v2025/sources/{id}/account-correlations-config`.
 *
 * Shape mirrors the public v2025 `CorrelationConfig` schema — non-authoritative
 * sources may not have a correlation config yet, hence the 404 → null
 * pattern at the factory level.
 */
export type CorrelationConfig = {
  /** Correlation configuration ID. */
  id?: string | null;
  /** Human label (typically `Source [name] Account Correlation`). */
  name?: string | null;
  /** Per-attribute correlation rules. */
  attributeAssignments?: CorrelationAttributeAssignment[] | null;
  /** Passthrough for any connector-specific extras. */
  [key: string]: unknown;
};

/**
 * `GET /v2025/sources/{id}/accounts/schema-mappings`.
 *
 * Returns the per-source schema mapping payload used by the Provisioning
 * tab. Two behaviours diverge from the rest of the factory:
 *
 *  - 404 → `null` (not all sources have schema mappings — non-authoritative
 *    or freshly-created sources commonly return 404 here).
 *  - Any other non-2xx → throws, so callers can render a dedicated error
 *    state rather than burying the failure in a permissive payload.
 *
 * The response shape is permissive (`SchemaMappings`) because the v2025
 * spec doesn't pin the body for this path and ISC returns connector-specific
 * extras alongside the canonical `attributes` array.
 */
export async function getSchemaMappings(
  opts: SailpointClientOptions,
  sourceId: string,
): Promise<SchemaMappings | null> {
  const path = `/v2025/sources/${encodeURIComponent(sourceId)}/accounts/schema-mappings`;
  const result = await sailpointFetch<SchemaMappings>(opts, path);
  if (result.ok) return result.data ?? null;
  if (result.error.kind === "api_error" && result.error.status === 404) {
    return null;
  }
  throw new Error(
    result.error.kind === "api_error"
      ? `Failed to fetch schema mappings (HTTP ${result.error.status}): ${result.error.message}`
      : result.error.kind === "auth_failed"
        ? result.error.message
        : "Not connected to SailPoint.",
  );
}

/**
 * `GET /v2025/sources/{id}/account-correlations-config`.
 *
 * Returns the correlation rules used to attach incoming accounts to
 * identities. Non-authoritative sources may have no config — those return
 * 404 here, surfaced as `null` so the Provisioning tab can render a
 * "no correlation configured" empty state.
 *
 * Other failures throw — same rationale as `getSchemaMappings`.
 */
export async function getCorrelationConfig(
  opts: SailpointClientOptions,
  sourceId: string,
): Promise<CorrelationConfig | null> {
  const path = `/v2025/sources/${encodeURIComponent(sourceId)}/account-correlations-config`;
  const result = await sailpointFetch<CorrelationConfig>(opts, path);
  if (result.ok) return result.data ?? null;
  if (result.error.kind === "api_error" && result.error.status === 404) {
    return null;
  }
  throw new Error(
    result.error.kind === "api_error"
      ? `Failed to fetch correlation config (HTTP ${result.error.status}): ${result.error.message}`
      : result.error.kind === "auth_failed"
        ? result.error.message
        : "Not connected to SailPoint.",
  );
}

// =====================================================================
// Aggregation runs + source activity (Phase 3 — #271).
// Implementation per the ADRs:
//  - `vault/Projects/Simplified Identity/2026-05-14-sources-aggregations-api-choice.md`
//    → Option B (sync-jobs) with runtime fallback to events index on
//      404/403.
//  - `vault/Projects/Simplified Identity/2026-05-14-sources-activity-audit-shape.md`
//    → ISC events index, app-side merge done in the apps/web shim.
//
// NOTE: the response shape for `/beta/sources/{id}/sync-jobs` was NOT
// spot-checked against a live sandbox (no env handle in this worktree
// per `~/brain/CLAUDE.md` "never list/guess sail envs"). The mapper
// `mapSyncJob` is best-effort against the ADR-documented shape and
// MAY need adjustment after the first live-tenant test — the
// `connectorAttributes`-style permissive parsing keeps unknown fields
// from crashing the call.
// =====================================================================

export type AggregationRunStatus =
  | "success"
  | "warning"
  | "error"
  | "running"
  | "terminated";
export type AggregationRunTrigger =
  | "manual"
  | "scheduled"
  | "api"
  | "unknown";
export type AggregationRunType =
  | "accounts"
  | "entitlements"
  | "unknown";

export type AggregationRunStats = {
  accountsScanned?: number;
  accountsAdded?: number;
  accountsUpdated?: number;
  accountsDeleted?: number;
  errors?: number;
  warnings?: number;
};

export type AggregationRun = {
  id: string;
  type: AggregationRunType;
  status: AggregationRunStatus;
  trigger: AggregationRunTrigger;
  /** ISO timestamp. Always present. */
  startedAt: string;
  /** ISO timestamp. May be undefined for runs still in progress. */
  completedAt?: string;
  /** Seconds. `undefined` when the source doesn't carry duration (events fallback). */
  durationSec?: number;
  /** Optional counts — undefined when source can't provide them. */
  stats?: AggregationRunStats;
  /** First-N error messages for drawer display. Undefined when not available. */
  errorSample?: { code?: string; message: string }[];
  /** `sync-jobs` is the primary feed (`/beta/sources/{id}/sync-jobs`).
   *  `events` is the fallback when sync-jobs returns 404/403. */
  origin: "sync-jobs" | "events";
};

export type AggregationRunsRange = "24h" | "7d" | "30d" | "90d";

export type ListAggregationRunsParams = {
  sourceId: string;
  range?: AggregationRunsRange;
  status?: AggregationRunStatus[];
  trigger?: AggregationRunTrigger[];
  /** Default 30 — the UI is built for "last 30 runs". Capped at 200. */
  limit?: number;
  /** Pagination offset — UI starts at 0. */
  offset?: number;
};

/**
 * Convert a `range` filter to the number of milliseconds it covers,
 * for client-side trimming when the underlying endpoint can't filter
 * by time. Returns `undefined` when no range is requested.
 */
function rangeToMs(range?: AggregationRunsRange): number | undefined {
  switch (range) {
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "90d":
      return 90 * 24 * 60 * 60 * 1000;
    default:
      return undefined;
  }
}

function applyClientFilters(
  runs: AggregationRun[],
  params: ListAggregationRunsParams,
): AggregationRun[] {
  let out = runs;
  const rangeMs = rangeToMs(params.range);
  if (rangeMs !== undefined) {
    const cutoff = Date.now() - rangeMs;
    out = out.filter((r) => {
      const t = Date.parse(r.startedAt);
      return Number.isFinite(t) && t >= cutoff;
    });
  }
  if (params.status && params.status.length > 0) {
    const allowed = new Set(params.status);
    out = out.filter((r) => allowed.has(r.status));
  }
  if (params.trigger && params.trigger.length > 0) {
    const allowed = new Set(params.trigger);
    out = out.filter((r) => allowed.has(r.trigger));
  }
  // Sort by startedAt desc — already the natural order from ISC but the
  // events-fallback path can interleave when paginating multiple pages.
  out = out.slice().sort((a, b) => {
    const ta = Date.parse(a.startedAt);
    const tb = Date.parse(b.startedAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  return out;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function mapSyncJobType(raw: unknown): AggregationRunType {
  const s = asString(raw)?.toUpperCase();
  if (!s) return "unknown";
  if (s.includes("ACCOUNT")) return "accounts";
  if (s.includes("ENTITLEMENT")) return "entitlements";
  return "unknown";
}

function mapSyncJobStatus(raw: unknown): AggregationRunStatus {
  const s = asString(raw)?.toUpperCase();
  switch (s) {
    case "SUCCESS":
    case "SUCCEEDED":
    case "COMPLETED":
      return "success";
    case "WARNING":
      return "warning";
    case "ERROR":
    case "FAILED":
    case "FAILURE":
      return "error";
    case "RUNNING":
    case "IN_PROGRESS":
    case "PENDING":
      return "running";
    case "TERMINATED":
    case "CANCELLED":
    case "CANCELED":
      return "terminated";
    default:
      return "error";
  }
}

function mapSyncJobTrigger(raw: unknown): AggregationRunTrigger {
  const s = asString(raw)?.toUpperCase();
  switch (s) {
    case "MANUAL":
      return "manual";
    case "SCHEDULED":
    case "SCHEDULE":
      return "scheduled";
    case "API":
      return "api";
    default:
      return "unknown";
  }
}

/**
 * Map a `/beta/sources/{id}/sync-jobs` entry into the unified
 * `AggregationRun` shape. Permissive — fields default to `undefined`
 * when the connector / ISC version doesn't emit them. Tagged
 * `origin: "sync-jobs"`.
 *
 * Best-effort against the ADR-documented response (see top-of-section
 * note). If a tenant returns a divergent shape, the mapping degrades
 * to `unknown` / `undefined` rather than throwing.
 */
function mapSyncJob(raw: unknown): AggregationRun | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = asString(o.id) ?? asString(o.syncJobId);
  const startedAt =
    asString(o.created) ?? asString(o.startedAt) ?? asString(o.startTime);
  if (!id || !startedAt) return null;

  const stats =
    o.stats && typeof o.stats === "object"
      ? (o.stats as Record<string, unknown>)
      : undefined;
  const errorsRaw = Array.isArray(o.errorSample)
    ? (o.errorSample as unknown[]).flatMap((e) => {
        if (!e || typeof e !== "object") return [];
        const r = e as Record<string, unknown>;
        const message = asString(r.message) ?? asString(r.error);
        if (!message) return [];
        const code = asString(r.code);
        const entry: { code?: string; message: string } = code
          ? { code, message }
          : { message };
        return [entry];
      })
    : [];
  const errors = errorsRaw.length > 0 ? errorsRaw : undefined;

  // `duration` in seconds (ADR-documented); some versions emit
  // `durationMs` instead.
  let durationSec = asNumber(o.duration);
  if (durationSec === undefined) {
    const ms = asNumber(o.durationMs);
    if (ms !== undefined) durationSec = Math.round(ms / 1000);
  }

  return {
    id,
    type: mapSyncJobType(o.type),
    status: mapSyncJobStatus(o.status),
    trigger: mapSyncJobTrigger(o.trigger),
    startedAt,
    completedAt: asString(o.completed) ?? asString(o.completedAt),
    durationSec,
    stats: stats
      ? {
          accountsScanned: asNumber(stats.accountsScanned),
          accountsAdded: asNumber(stats.accountsAdded),
          accountsUpdated: asNumber(stats.accountsUpdated),
          accountsDeleted: asNumber(stats.accountsDeleted),
          errors: asNumber(stats.errors),
          warnings: asNumber(stats.warnings),
        }
      : undefined,
    errorSample: errors,
    origin: "sync-jobs",
  };
}

/**
 * Map an ISC `events` index doc into an `AggregationRun`. Tagged
 * `origin: "events"`. `durationSec` / `stats` / `errorSample` collapse
 * to `undefined` — the events index doesn't carry them in a structured
 * way (see ADR § Option A).
 *
 * Returns `null` when the event isn't actually an aggregation — we now
 * query the events index without an `action:` filter (some tenants
 * don't emit `AGGREGATE_*`-prefixed actions), so the per-doc filter
 * lives here.
 */
function mapAggregationEvent(raw: unknown): AggregationRun | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = asString(o.id) ?? asString(o._id);
  const startedAt = asString(o.created);
  if (!id || !startedAt) return null;

  const action = asString(o.action) ?? "";
  // Aggregation events vary by tenant: `CLOUD_AGGREGATE_*`,
  // `SOURCE_AGGREGATION_*`, `AGGREGATION_*`, `aggregation*`, etc. Catch
  // anything that mentions "aggregat" — false positives are vanishingly
  // rare and degrade gracefully to `type: unknown`.
  if (!/aggregat/i.test(action)) return null;
  const attributes =
    o.attributes && typeof o.attributes === "object"
      ? (o.attributes as Record<string, unknown>)
      : undefined;

  let type: AggregationRunType = "unknown";
  if (action.includes("ACCOUNT")) type = "accounts";
  else if (action.includes("ENTITLEMENT")) type = "entitlements";

  // `status` in the event payload tends to live under attributes.status
  // ("Success" / "Error" / "Warning"); fall back to the action suffix.
  let status: AggregationRunStatus = "success";
  const attrStatus = asString(attributes?.status);
  if (attrStatus) status = mapSyncJobStatus(attrStatus);
  else if (action.endsWith("_FAILED") || action.endsWith("_ERROR"))
    status = "error";

  return {
    id,
    type,
    status,
    trigger: "unknown", // events index doesn't expose trigger.
    startedAt,
    origin: "events",
  };
}

/**
 * Internal — fetch the primary sync-jobs feed.
 * Returns `null` on 404/403 to signal the caller should fall back to
 * the events index. Any other error propagates as `{ ok: false }`.
 */
async function fetchSyncJobs(
  opts: SailpointClientOptions,
  params: ListAggregationRunsParams,
): Promise<ListResult<AggregationRun> | null> {
  const sp = new URLSearchParams();
  sp.set("limit", String(Math.min(params.limit ?? 30, 200)));
  if (params.offset !== undefined) sp.set("offset", String(params.offset));
  const path = `/beta/sources/${encodeURIComponent(params.sourceId)}/sync-jobs?${sp.toString()}`;

  const result = await sailpointFetch<unknown>(opts, path);
  if (!result.ok) {
    if (
      result.error.kind === "api_error" &&
      (result.error.status === 404 || result.error.status === 403)
    ) {
      return null; // signal fallback
    }
    return mapError(result.error);
  }
  const raw = result.data;
  const items = Array.isArray(raw) ? (raw as unknown[]) : [];
  const mapped = items
    .map(mapSyncJob)
    .filter((r): r is AggregationRun => r !== null);
  return { ok: true, data: mapped };
}

/**
 * Internal — fallback events-index feed when sync-jobs is unavailable
 * (404/403). Uses `POST /v2025/search` on `indices: ["events"]` with
 * an `action:AGGREGATE_* AND target.id:"..."` query. Pagination is via
 * URL query params (`?limit=&offset=`) — the body's `from`/`size` are
 * silently ignored by ISC (memory `feedback_sail_search_pagination`).
 */
async function fetchAggregationEventsFallback(
  opts: SailpointClientOptions,
  params: ListAggregationRunsParams,
): Promise<ListResult<AggregationRun>> {
  // Over-fetch (3x) since `mapAggregationEvent` filters per-doc for the
  // "aggregat"-action pattern. ISC's events index mixes aggregation and
  // unrelated source events on the same `target.id`.
  const limit = Math.min((params.limit ?? 30) * 3, 200);
  const offset = params.offset ?? 0;
  const escaped = params.sourceId.replace(/"/g, '\\"');
  const body = {
    indices: ["events"],
    // No `action:` clause — actions vary by tenant. `mapAggregationEvent`
    // filters per-doc on `/aggregat/i`.
    query: { query: `target.id:"${escaped}"` },
    queryType: "SAILPOINT",
    sort: ["-created"],
  };

  const res = await fetch(
    `${opts.baseUrl}/v2025/search?limit=${limit}&offset=${offset}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (res.status === 401) {
    return {
      ok: false,
      status: 401,
      message: "SailPoint rejected the access token. Sign in again.",
    };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: text || res.statusText };
  }
  try {
    const data = (await res.json()) as unknown;
    const items = Array.isArray(data) ? (data as unknown[]) : [];
    const mapped = items
      .map(mapAggregationEvent)
      .filter((r): r is AggregationRun => r !== null);
    return { ok: true, data: mapped };
  } catch (e) {
    return {
      ok: false,
      status: res.status,
      message: `Couldn't parse SailPoint response: ${(e as Error).message}`,
    };
  }
}

/**
 * List aggregation runs for a source.
 *
 * Tries `GET /beta/sources/{id}/sync-jobs` first (rich `duration` /
 * `stats` / `errorSample` for the bar chart + drawer). On 404 / 403
 * (the `beta` endpoint isn't available on every tenant tier), falls
 * back to `POST /v2025/search` against the events index — with the
 * understanding that the events-fallback rows degrade gracefully
 * (`durationSec` / `stats` / `errorSample` undefined, `trigger:
 * "unknown"`). The `origin` field tags each row so the UI can render
 * a banner ("Detailed run metrics unavailable on this tenant…") and
 * adapt the bar chart / table / drawer.
 *
 * Filters (`range`, `status`, `trigger`) are applied client-side after
 * fetch since neither endpoint supports them server-side in a portable
 * way. Results are sorted by `startedAt` desc.
 */
export async function listAggregationRuns(
  opts: SailpointClientOptions,
  params: ListAggregationRunsParams,
): Promise<ListResult<AggregationRun>> {
  // ADR amendment (2026-05-14, post-live-tenant validation): the
  // `/beta/sources/{id}/sync-jobs` endpoint the ADR put as Option B
  // returns 404 on the tenants we tested. Events index (Option A) is
  // therefore the *primary* feed; sync-jobs becomes an opportunistic
  // upgrade if/when ISC exposes it on a future tenant.
  const events = await fetchAggregationEventsFallback(opts, params);
  if (!events.ok) return events;
  if (events.data.length > 0) {
    return { ok: true, data: applyClientFilters(events.data, params) };
  }
  // Empty from events → optimistically try sync-jobs (a few tenant
  // tiers might expose it, ADR Option B). Swallow 404/403 silently —
  // we already have a known-empty result to fall back to.
  const syncJobs = await fetchSyncJobs(opts, params);
  if (syncJobs && syncJobs.ok) {
    return { ok: true, data: applyClientFilters(syncJobs.data, params) };
  }
  return { ok: true, data: [] };
}

// =====================================================================
// Source activity (Phase 3 — #271).
// The factory layer exposes the ISC-side fetch + the unified types;
// the app-side audit-table merge lives in `apps/web/lib/sailpoint/
// sources-api.ts` (shim) so we don't drag a libsql dependency into the
// pure HTTP package.
// =====================================================================

/** Activity actor — discriminated union covering both origins. */
export type ActivityActor =
  | { kind: "app-user"; userId: string; email?: string; name?: string }
  | { kind: "isc-system"; label: string }
  | { kind: "isc-user"; iscIdentityId?: string; name?: string; email?: string }
  | { kind: "unknown"; label?: string };

export type ActivitySeverity = "info" | "warning" | "danger";

export type ActivityEntry = {
  /** Unique across both streams (app row id or ISC events doc _id). */
  id: string;
  /** ISO timestamp. */
  occurredAt: string;
  origin: "app" | "isc";
  /** App: `source.renamed`. ISC: the raw `action` (e.g. `AGGREGATE_*`). */
  action: string;
  severity: ActivitySeverity;
  actor: ActivityActor;
  summary: string;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  /** Free-form per-action payload — `{ taskId, durationMs, ... }`. */
  metadata?: Record<string, unknown>;
  /** Raw ISC events doc when origin === "isc" — for the drawer. */
  iscPayload?: Record<string, unknown>;
};

export type ListSourceActivityFilters = {
  search?: string;
  /** Free-text actor label / email / userId / name. */
  actor?: string;
  /** Filter on the mapped action (app or ISC `action`). */
  actionType?: string;
  /** ISO timestamps. */
  from?: string;
  to?: string;
  /** Default 50, capped at 200. */
  limit?: number;
  offset?: number;
};

export type ListSourceActivityResult = {
  entries: ActivityEntry[];
  /** Honest disclosure about ISC-side retention (~30d). */
  iscRetentionHint?: { approximateOldestAvailable: string };
};

/**
 * Internal — fetch ISC events for a source via `POST /v2025/search`.
 * Pagination via URL params per the memory note (body `from`/`size`
 * are silently ignored).
 *
 * Returns the raw events docs — callers map them via `mapIscEvent` /
 * `mapAggregationEvent`. Errors propagate as a thrown error since the
 * shim function wants to render a partial timeline (app side only)
 * rather than fail the page; the shim swallows + flags the banner.
 */
export async function fetchSourceEvents(
  opts: SailpointClientOptions,
  sourceId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<{
  ok: true;
  data: Record<string, unknown>[];
}> {
  const limit = Math.min(options.limit ?? 50, 200);
  const offset = options.offset ?? 0;
  const escaped = sourceId.replace(/"/g, '\\"');
  const body = {
    indices: ["events"],
    query: { query: `target.id:"${escaped}"` },
    queryType: "SAILPOINT",
    sort: ["-created"],
  };
  const res = await fetch(
    `${opts.baseUrl}/v2025/search?limit=${limit}&offset=${offset}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `ISC search failed (HTTP ${res.status}): ${text || res.statusText}`,
    );
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return { ok: true, data: [] };
  return {
    ok: true,
    data: data.filter(
      (d): d is Record<string, unknown> =>
        d !== null && typeof d === "object",
    ),
  };
}

function mapIscSeverity(action: string): ActivitySeverity {
  const a = action.toUpperCase();
  if (a.includes("FAIL") || a.includes("ERROR")) return "danger";
  if (a.includes("WARN")) return "warning";
  return "info";
}

function mapIscActor(actor: unknown): ActivityActor {
  if (!actor || typeof actor !== "object") return { kind: "unknown" };
  const o = actor as Record<string, unknown>;
  const name = asString(o.name) ?? "";
  const type = asString(o.type)?.toUpperCase();
  if (
    type === "MACHINE" ||
    type === "SYSTEM" ||
    /^system$/i.test(name) ||
    /aggregation engine/i.test(name) ||
    /aggregation-job/i.test(name)
  ) {
    return { kind: "isc-system", label: name || "System" };
  }
  if (/@/.test(name)) {
    return { kind: "isc-user", name, email: name };
  }
  return { kind: "isc-user", name: name || "Unknown" };
}

/**
 * Convert a raw ISC events doc into an `ActivityEntry`. Permissive
 * — fields default to undefined when the doc shape differs.
 */
export function mapIscEvent(doc: Record<string, unknown>): ActivityEntry | null {
  const id = asString(doc.id) ?? asString(doc._id);
  const occurredAt = asString(doc.created);
  if (!id || !occurredAt) return null;
  const action = asString(doc.action) ?? "UNKNOWN";
  return {
    id,
    occurredAt,
    origin: "isc",
    action,
    severity: mapIscSeverity(action),
    actor: mapIscActor(doc.actor),
    summary: action.replace(/_/g, " ").toLowerCase(),
    iscPayload: doc,
  };
}
