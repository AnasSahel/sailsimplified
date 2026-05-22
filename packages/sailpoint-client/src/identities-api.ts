import {
  sailpointFetch,
  type SailpointClientOptions,
  type SailpointFetchError,
} from "./client";

/**
 * Identities API factory (v0).
 *
 * Six pure functions covering the read surface needed by the admin
 * Identities list + detail experience, plus the single write action
 * (`processIdentity`). Mirrors the shape of `transforms-api.ts`:
 *  - takes `SailpointClientOptions` explicitly (no DB / no auth state),
 *  - returns discriminated `{ ok }` results with `status` on failure so
 *    callers can branch on 403 without parsing a generic Error.
 *
 * Type coverage is deliberately narrow: only the fields consumers actually
 * read are typed. Anything else lives in `attributes: Record<string, unknown>`
 * — consumers cast at the point of use rather than relying on an exhaustive
 * schema that would rot the first time SailPoint adds a field.
 */

export type IdentityProfileRef = {
  id: string;
  name: string;
};

export type IdentityManagerRef = {
  id: string;
  name: string;
  type?: string;
};

export type IdentityLifecycleState = {
  stateName?: string | null;
  manuallyUpdated?: boolean;
};

export type IdentitySummary = {
  id: string;
  name: string;
  alias?: string | null;
  emailAddress?: string | null;
  identityStatus?: string | null;
  lifecycleState?: IdentityLifecycleState | null;
  identityProfile?: IdentityProfileRef | null;
  managerRef?: IdentityManagerRef | null;
  attributes?: Record<string, unknown> | null;
  created?: string;
  modified?: string;
};

export type IdentityDetail = IdentitySummary & {
  attributes: Record<string, unknown>;
};

export type IdentityProfileSummary = {
  id: string;
  name: string;
  description?: string | null;
  /**
   * Each Identity Profile is tied to exactly one authoritative source.
   * Surfaced because `/v2025/identities/{id}` does NOT include
   * `identityProfile` in its payload — only `attributes.cloudAuthoritativeSource`
   * (a source id). Callers resolve identity → profile by listing profiles
   * and matching locally; the API rejects `filters=authoritativeSource.id eq`
   * with 400 (semantically invalid).
   */
  authoritativeSource?: { id: string; name: string; type?: string } | null;
};

/**
 * Lifecycle state as defined on an Identity Profile. Only the fields the UI
 * reads are typed; `accessProfileIds`, `accountActions`, etc. exist in the
 * API but stay untyped here until a consumer needs them.
 *
 * The identity's `lifecycleState.stateName` matches `technicalName` on
 * tenants where the two differ; on tenants where `name === technicalName`
 * a case-insensitive comparison on either works.
 */
export type IdentityProfileLifecycleState = {
  id: string;
  name: string;
  technicalName: string;
  enabled: boolean;
  description?: string | null;
  identityState?: "ACTIVE" | "INACTIVE_SHORT_TERM" | "INACTIVE_LONG_TERM" | null;
};

export type IdentityAccount = {
  id: string;
  name?: string;
  nativeIdentity?: string | null;
  sourceId: string;
  sourceName: string;
  identityId?: string | null;
  uuid?: string | null;
  disabled?: boolean;
  locked?: boolean;
  authoritative?: boolean;
  manuallyCorrelated?: boolean;
  created?: string;
  modified?: string;
  attributes?: Record<string, unknown> | null;
};

export type IdentityAccessItemType =
  | "ROLE"
  | "ACCESS_PROFILE"
  | "ENTITLEMENT"
  | string;

export type IdentityAccessItem = {
  id: string;
  name: string;
  description?: string | null;
  accessType: IdentityAccessItemType;
  sourceName?: string | null;
  sourceId?: string | null;
  /**
   * SailPoint surfaces the origin of the assignment (role / access profile /
   * direct grant). Shape varies per accessType — kept loose on purpose.
   */
  standalone?: boolean;
  revocable?: boolean;
};

export type ListIdentitiesParams = {
  limit?: number;
  offset?: number;
  /** SailPoint SCIM-like filter expression (e.g. `name co "alice"`). */
  filters?: string;
  /** SailPoint sorters expression (e.g. `name` or `-modified`). */
  sorters?: string;
  /** Request `X-Total-Count` header for pagination. Defaults to false. */
  count?: boolean;
};

/**
 * Search-enriched identity hit. Distinct from `IdentitySummary` because the
 * `/v2025/search` payload uses different field paths (`displayName`, `email`,
 * nested `manager`, embedded `accounts[]` / `access[]`) than the canonical
 * `/v2025/identities` shape — pretending they're the same type would lie.
 *
 * Only the fields we read in the UI are typed. Anything else stays in
 * `attributes` / inside the nested arrays and consumers cast at point of use.
 */
export type IdentitySearchHit = {
  id: string;
  name: string;
  displayName?: string | null;
  email?: string | null;
  attributes?: Record<string, unknown> | null;
  identityProfile?: IdentityProfileRef | null;
  lifecycleState?: IdentityLifecycleState | null;
  manager?: {
    id?: string;
    name?: string;
    displayName?: string;
  } | null;
  modified?: string | null;
  /**
   * Nested account stubs from the search index. Enough to count + render
   * source badges; not enough to replace `getIdentityAccounts` on detail.
   */
  accounts?: Array<{
    id: string;
    name?: string;
    source?: { id: string; name: string };
  }> | null;
  /**
   * Nested access items. `type` is `ENTITLEMENT | ACCESS_PROFILE | ROLE`.
   * Consumers filter on `type === "ENTITLEMENT"` to count entitlements only.
   */
  access?: Array<{
    id: string;
    name?: string;
    type?: string;
  }> | null;
};

export type SearchIdentitiesParams = {
  /** Free-text on name + email + employeeNumber. */
  q?: string;
  profileId?: string | null;
  lcs?: string | null;
  department?: string | null;
  /** Risk bucket: `low | medium | high | critical`. */
  risk?: string | null;
  /**
   * Extra Elastic query string AND'd onto the rest. Used by KPI counters
   * that need a derivative of the page filters (e.g. "external only").
   */
  extra?: string;
  limit?: number;
  offset?: number;
  /** Elastic sort key. Default `name`. Prefix `-` for descending. */
  sort?: string;
};

/**
 * Result shapes. We expose `status` so consumers can branch on 403 (no
 * permission to read the resource) without falling into a generic Error
 * path. 403 is the only non-200 status the issue calls out as a hot path,
 * but other api_error statuses propagate identically.
 */
export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export type ListResult<T> =
  | { ok: true; data: T[]; total?: number }
  | { ok: false; status: number; message: string };

export type ProcessIdentityResult =
  | { ok: true; taskId?: string }
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

function buildIdentitiesQuery(params: ListIdentitiesParams): string {
  const sp = new URLSearchParams();
  if (params.limit !== undefined) sp.set("limit", String(params.limit));
  if (params.offset !== undefined) sp.set("offset", String(params.offset));
  if (params.filters) sp.set("filters", params.filters);
  if (params.sorters) sp.set("sorters", params.sorters);
  if (params.count) sp.set("count", "true");
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/**
 * `GET /v2025/identities` — list page + filters.
 *
 * Supports server-side pagination and SailPoint's filter / sorter grammar.
 * When `params.count` is true we use a direct `fetch` instead of the shared
 * `sailpointFetch` helper, because we need access to the `X-Total-Count`
 * response header to drive pagination.
 */
export async function listIdentities(
  opts: SailpointClientOptions,
  params: ListIdentitiesParams = {},
): Promise<ListResult<IdentitySummary>> {
  const path = `/v2025/identities${buildIdentitiesQuery(params)}`;

  if (!params.count) {
    const result = await sailpointFetch<IdentitySummary[]>(opts, path);
    if (!result.ok) return mapError(result.error);
    return { ok: true, data: result.data };
  }

  // Header-aware path: we need X-Total-Count, which sailpointFetch hides.
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
    return {
      ok: false,
      status: res.status,
      message: text || res.statusText,
    };
  }

  const totalHeader = res.headers.get("x-total-count");
  const total = totalHeader && !Number.isNaN(Number(totalHeader))
    ? Number(totalHeader)
    : undefined;

  if (
    res.status === 204 ||
    res.headers.get("content-length") === "0"
  ) {
    return { ok: true, data: [], total };
  }

  try {
    const data = (await res.json()) as IdentitySummary[];
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
 * Lightweight identity row from `/v2025/public-identities`. The endpoint
 * returns a small projection (id, name, alias, email, attributes) — ideal
 * for the transform Test "pick an identity" autocomplete where we only
 * need enough to render a search result row. Full attribute set comes
 * later via `getIdentity` once the user commits to a selection.
 */
export type PublicIdentitySummary = {
  id: string;
  name: string;
  alias?: string | null;
  email?: string | null;
  attributes?: Record<string, unknown> | null;
};

export type SearchPublicIdentitiesParams = {
  /**
   * Free-text query — applied as
   * `firstname sw "q" or lastname sw "q" or email sw "q" or alias sw "q"`.
   */
  q: string;
  /** Defaults to 10. */
  limit?: number;
};

/**
 * `GET /v2025/public-identities?filters=...` — search by name or email.
 *
 * Uses SailPoint's SCIM-like filter grammar with `sw` (starts with) on
 * the four queryable string fields of this endpoint: `firstname`,
 * `lastname`, `email`, `alias`. Returns an empty list for an empty
 * query rather than hitting the API — the picker dialog has no use for
 * the unfiltered first page.
 *
 * NOTE: the canonical `name` field that `/v2025/identities` exposes is
 * NOT queryable on this endpoint (the API rejects it with
 * `400 — Invalid filter properties: "[name]". Properties are not queryable.`).
 * The four fields below are the documented queryable set — see
 * https://developer.sailpoint.com/docs/api/v2025/get-public-identities.
 */
export async function searchPublicIdentities(
  opts: SailpointClientOptions,
  params: SearchPublicIdentitiesParams,
): Promise<ListResult<PublicIdentitySummary>> {
  const q = params.q.trim();
  const limit = params.limit ?? 10;
  if (!q) return { ok: true, data: [] };

  // SCIM-like filter expects double-quote string literals. Escape any
  // user-supplied quote / backslash so the filter remains well-formed.
  const safe = q.replace(/["\\]/g, "\\$&");
  const filters =
    `firstname sw "${safe}" or lastname sw "${safe}"` +
    ` or email sw "${safe}" or alias sw "${safe}"`;
  // URLSearchParams percent-encodes the quotes and spaces correctly.
  const qs = new URLSearchParams({ filters, limit: String(limit) }).toString();

  const result = await sailpointFetch<PublicIdentitySummary[]>(
    opts,
    `/v2025/public-identities?${qs}`,
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, data: result.data };
}

/**
 * `GET /v2025/identities/{id}` — detail header + Attributes tab.
 */
export async function getIdentity(
  opts: SailpointClientOptions,
  id: string,
): Promise<FetchResult<IdentityDetail>> {
  const result = await sailpointFetch<IdentityDetail>(
    opts,
    `/v2025/identities/${encodeURIComponent(id)}`,
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, data: result.data };
}

/**
 * `GET /v2025/accounts?filters=identityId eq "{id}"` — Accounts tab.
 *
 * The v2025 accounts list endpoint takes its identity-scope via the
 * `filters` query param (SCIM-like), not via a top-level `identityId`
 * query param. We build the filter here so consumers don't have to know.
 */
export async function getIdentityAccounts(
  opts: SailpointClientOptions,
  id: string,
): Promise<FetchResult<IdentityAccount[]>> {
  const filters = `identityId eq "${id.replace(/"/g, '\\"')}"`;
  const qs = new URLSearchParams({
    filters,
    limit: "250",
  }).toString();
  const result = await sailpointFetch<IdentityAccount[]>(
    opts,
    `/v2025/accounts?${qs}`,
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, data: result.data };
}

/**
 * `GET /v2025/identities/{id}/access-items` — Access tab.
 *
 * Returns entitlements + access profiles + roles assigned to the identity,
 * each annotated with its `accessType` so the consumer can group.
 */
export async function getIdentityAccess(
  opts: SailpointClientOptions,
  id: string,
): Promise<FetchResult<IdentityAccessItem[]>> {
  const result = await sailpointFetch<IdentityAccessItem[]>(
    opts,
    `/v2025/identities/${encodeURIComponent(id)}/access-items`,
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, data: result.data };
}

/**
 * `POST /v2025/identities/process` — Process action.
 *
 * Re-runs identity processing for the given identity. Accepts a batch of
 * ids; pass `[id]` for the single-identity flow used by the detail page.
 *
 * Returns 202 Accepted with no body in the common case; an optional task
 * id may be present in the response.
 */
export async function processIdentity(
  opts: SailpointClientOptions,
  id: string,
): Promise<ProcessIdentityResult> {
  return processIdentities(opts, [id]);
}

/**
 * Bulk variant — same endpoint, multiple ids in one call. Used by the
 * Identities list bulk action. The endpoint accepts an array; the tenant
 * enforces its own ceiling (commonly a few hundred) — callers should cap
 * the selection before invoking.
 */
export async function processIdentities(
  opts: SailpointClientOptions,
  ids: string[],
): Promise<ProcessIdentityResult> {
  if (ids.length === 0) {
    return { ok: false, status: 400, message: "No identities selected." };
  }
  const result = await sailpointFetch<{ taskId?: string } | null>(
    opts,
    `/v2025/identities/process`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityIds: ids }),
    },
  );
  if (!result.ok) {
    const m = mapError(result.error);
    return { ok: false, status: m.status, message: m.message };
  }
  return { ok: true, taskId: result.data?.taskId };
}

/**
 * `GET /v2025/identity-profiles` — profile filter dropdown + profile
 * lookup by authoritative source (the v2025 identity detail endpoint
 * doesn't include `identityProfile`, so resolving identity → profile
 * requires this listing + a local match on `authoritativeSource.id`).
 */
export async function listIdentityProfiles(
  opts: SailpointClientOptions,
): Promise<FetchResult<IdentityProfileSummary[]>> {
  const result = await sailpointFetch<IdentityProfileSummary[]>(
    opts,
    "/v2025/identity-profiles?limit=250",
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, data: result.data };
}

/**
 * `GET /v2025/identity-profiles/{id}/lifecycle-states` — list of LCS
 * configured on a given Identity Profile. Powers the Identity Details
 * Lifecycle stepper. 403 surfaces normally so callers can degrade.
 */
export async function getIdentityProfileLifecycleStates(
  opts: SailpointClientOptions,
  profileId: string,
): Promise<FetchResult<IdentityProfileLifecycleState[]>> {
  const result = await sailpointFetch<IdentityProfileLifecycleState[]>(
    opts,
    `/v2025/identity-profiles/${encodeURIComponent(profileId)}/lifecycle-states`,
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, data: result.data };
}

/**
 * Escapes a value for inclusion in an Elastic query string literal. ISC's
 * search uses the standard Elastic syntax — double-quote and backslash both
 * need escaping. Wildcards (`*`, `?`) are preserved on purpose so callers
 * can substring-search.
 */
function escapeElastic(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

/**
 * Build the Elastic query string from structured filters. Returns `*` when
 * no filter is active so the API gets a well-formed query.
 *
 * Field paths follow ISC's search index conventions:
 *  - `name`, `email` → wildcarded substring match
 *  - `attributes.employeeNumber` → wildcarded substring match
 *  - `identityProfile.id` → exact match
 *  - `attributes.cloudLifecycleState` → exact match (note: NOT
 *    `lifecycleState.stateName` — the search index flattens this)
 *  - `attributes.department.exact` → exact match (keyword sub-field)
 *  - `attributes.identityRiskScore` → exact match (bucket string)
 */
export function buildIdentitySearchQuery(p: SearchIdentitiesParams): string {
  const parts: string[] = [];
  if (p.q && p.q.trim()) {
    const safe = escapeElastic(p.q.trim());
    parts.push(
      `(name:*${safe}* OR email:*${safe}* OR attributes.employeeNumber:*${safe}*)`,
    );
  }
  if (p.profileId) {
    parts.push(`identityProfile.id:"${escapeElastic(p.profileId)}"`);
  }
  if (p.lcs) {
    parts.push(`attributes.cloudLifecycleState:"${escapeElastic(p.lcs)}"`);
  }
  if (p.department) {
    parts.push(
      `attributes.department.exact:"${escapeElastic(p.department)}"`,
    );
  }
  if (p.risk) {
    parts.push(
      `attributes.identityRiskScore:"${escapeElastic(p.risk)}"`,
    );
  }
  if (p.extra) parts.push(`(${p.extra})`);
  return parts.length ? parts.join(" AND ") : "*";
}

/**
 * `POST /v2025/search` (indices: identities) — list with embedded
 * `accounts[]` + `access[]` and exposed attributes (`department`,
 * `jobTitle`, `identityRiskScore`).
 *
 * Returns the same `ListResult<T>` shape as `listIdentities` so the
 * call-site error handling stays identical. Total comes from the
 * `X-Total-Count` response header.
 */
export async function searchIdentities(
  opts: SailpointClientOptions,
  params: SearchIdentitiesParams = {},
): Promise<ListResult<IdentitySearchHit>> {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const body = {
    indices: ["identities"],
    query: { query: buildIdentitySearchQuery(params) },
    queryType: "SAILPOINT",
    sort: [params.sort ?? "name"],
    includeNested: true,
  };

  const res = await fetch(
    `${opts.baseUrl}/v2025/search?limit=${limit}&offset=${offset}&count=true`,
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

  const totalHeader = res.headers.get("x-total-count");
  const total =
    totalHeader && !Number.isNaN(Number(totalHeader))
      ? Number(totalHeader)
      : undefined;

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return { ok: true, data: [], total };
  }
  try {
    const data = (await res.json()) as IdentitySearchHit[];
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
 * Count-only variant of `searchIdentities`. Uses `limit=0` to skip the
 * result body and pulls the total off the `X-Total-Count` header. Returns
 * `undefined` on any failure — counts feed best-effort KPI cards, never
 * a hard error path.
 */
export async function countIdentities(
  opts: SailpointClientOptions,
  params: SearchIdentitiesParams = {},
): Promise<number | undefined> {
  const body = {
    indices: ["identities"],
    query: { query: buildIdentitySearchQuery(params) },
    queryType: "SAILPOINT",
  };
  try {
    const res = await fetch(
      `${opts.baseUrl}/v2025/search?limit=0&count=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return undefined;
    const total = res.headers.get("x-total-count");
    if (!total) return undefined;
    const n = Number(total);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}
