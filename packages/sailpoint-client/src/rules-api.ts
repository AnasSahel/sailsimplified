import {
  sailpointFetch,
  type SailpointClientOptions,
  type SailpointFetchError,
} from "./client";

/**
 * Connector-rules HTTP data layer (read-only v1) — mirrors the boundary of
 * `transforms-api.ts`: pure HTTP, no DB, no analysis. Covers the read
 * surface for the source-attached connector-rules inventory
 * (`/v2025/connector-rules`).
 *
 * Boundary note (monorepo rule, `~/brain/projects/products/simplified-identity/CLAUDE.md`):
 * the canonical `RuleRecord` is owned by `@simplified-identity/rules`, but
 * this package must NOT depend on it (packages never import each other —
 * cf. the PR-4 boundary refinement). So we declare a structurally-identical
 * HTTP DTO here (`ConnectorRule`), exactly as `transforms-api.ts` declares
 * its own `TransformRecord` rather than importing the transforms package.
 * The web layer treats `ConnectorRule` as a `RuleRecord` (structurally
 * assignable) when feeding the pure analysis.
 */

export type ConnectorRuleSignatureParam = {
  name: string;
  description?: string | null;
  type?: string | null;
};

export type ConnectorRuleSignature = {
  input?: ConnectorRuleSignatureParam[];
  output?: ConnectorRuleSignatureParam | null;
};

export type ConnectorRuleSourceCode = {
  version?: string | null;
  script: string;
};

/**
 * A connector rule as returned by `/v2025/connector-rules`. Structurally a
 * superset of `RuleLike` (the usages walker only needs `id` + `name`) and
 * identical in shape to `@simplified-identity/rules`' `RuleRecord` — kept
 * local to honour the no-cross-package-dependency invariant.
 */
export type ConnectorRule = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  signature?: ConnectorRuleSignature | null;
  sourceCode?: ConnectorRuleSourceCode | null;
  attributes?: Record<string, unknown> | null;
  created?: string;
  modified?: string;
};

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

/**
 * List connector rules on the connected tenant.
 *
 * `/v2025/connector-rules` returns each rule **with** its `sourceCode`
 * inline (unlike some ISC list endpoints that omit heavy fields) — so the
 * single list call powers both the inventory and the drawer's code viewer
 * without a per-rule fetch. The page caps at the ISC list limit (250);
 * tenants rarely have more than a handful of connector rules.
 */
export async function listConnectorRules(
  opts: SailpointClientOptions,
): Promise<FetchResult<ConnectorRule[]>> {
  const result = await sailpointFetch<ConnectorRule[]>(
    opts,
    "/v2025/connector-rules?limit=250",
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, data: result.data };
}

/**
 * Fetch a single connector rule by id (with `sourceCode`). The list call
 * already carries `sourceCode`, so this is for direct/deep-link loads
 * where the list wasn't fetched.
 */
export async function getConnectorRule(
  opts: SailpointClientOptions,
  id: string,
): Promise<FetchResult<ConnectorRule>> {
  const result = await sailpointFetch<ConnectorRule>(
    opts,
    `/v2025/connector-rules/${encodeURIComponent(id)}`,
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, data: result.data };
}

function mapError(err: SailpointFetchError): {
  ok: false;
  status: number;
  message: string;
} {
  if (err.kind === "not_connected") {
    return {
      ok: false,
      status: 0,
      message:
        "Not connected to SailPoint. Sign in again or check the tenant configuration.",
    };
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
