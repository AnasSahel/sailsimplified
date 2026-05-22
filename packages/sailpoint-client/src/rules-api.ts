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
 * Write payload for create/update. ISC requires `name`, `type` and
 * `sourceCode`; `description`, `signature` and `attributes` are optional.
 * Update (PUT) carries the same body — the `id` goes in the path, not the
 * body — so a single payload type serves both verbs (mirrors
 * `transforms-api.ts`' single `TransformPayload`).
 */
export type ConnectorRulePayload = {
  name: string;
  type: string;
  sourceCode: ConnectorRuleSourceCode;
  description?: string | null;
  signature?: ConnectorRuleSignature | null;
  attributes?: Record<string, unknown> | null;
};

export type CreateOrUpdateRuleResult =
  | { ok: true; id: string; data: ConnectorRule }
  | { ok: false; status: number; message: string };

export type DeleteRuleResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Outcome of `POST /v2025/connector-rules/validate`. ISC returns
 * `{ state: "OK", details: null }` on a clean compile, or
 * `{ state: "ERROR", details: [{ line, message }] }` when the BeanShell
 * fails to parse/compile server-side. We surface the raw details so the
 * editor can pin each error to its line.
 */
export type RuleValidationDetail = {
  line?: number;
  message: string;
};

export type ValidateRuleResult =
  | { ok: true; state: "OK" | "ERROR"; details: RuleValidationDetail[] }
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

/**
 * Validate a BeanShell script server-side **without persisting anything**
 * (`POST /v2025/connector-rules/validate`). The body is a bare
 * `SourceCode` (`{ version, script }`). This is the gate the editor runs
 * before every save — connector rules execute in provisioning, so an
 * unvalidated save is a production hazard (epic #350 decision).
 *
 * A non-2xx is a transport/auth failure → `{ ok: false }`. A 2xx with
 * `state: "ERROR"` is a *successful* validation call that found script
 * errors → `{ ok: true, state: "ERROR", details }`. Callers must branch on
 * both `ok` and `state`.
 *
 * GOTCHA (verified against a live v2025 tenant, 2026-05): this endpoint is
 * **shallow** — it returned `state: OK` for pure gibberish
 * (`this is )))) not [[ valid java`). It does not compile/parse the
 * BeanShell. So a green "validated" result is NOT a guarantee the script
 * runs. We still gate save on it (it's the only server-side check ISC
 * offers, and it surfaces whatever subset of errors ISC *does* report),
 * but the gate is weaker than its name implies — don't treat OK as
 * "this rule is correct".
 */
export async function validateConnectorRule(
  opts: SailpointClientOptions,
  sourceCode: ConnectorRuleSourceCode,
): Promise<ValidateRuleResult> {
  const result = await sailpointFetch<{
    state?: string;
    details?: RuleValidationDetail[] | null;
  }>(opts, "/v2025/connector-rules/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sourceCode),
  });
  if (!result.ok) return mapError(result.error);
  const state = result.data?.state === "OK" ? "OK" : "ERROR";
  return { ok: true, state, details: result.data?.details ?? [] };
}

/**
 * Create a connector rule. Returns the new rule's id on success. ISC does
 * **not** validate the BeanShell on create (it persists invalid scripts),
 * so the caller must run `validateConnectorRule` first.
 */
export async function createConnectorRule(
  opts: SailpointClientOptions,
  payload: ConnectorRulePayload,
): Promise<CreateOrUpdateRuleResult> {
  const result = await sailpointFetch<ConnectorRule>(
    opts,
    "/v2025/connector-rules",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, id: result.data.id, data: result.data };
}

/**
 * Update an existing connector rule. SailPoint expects a full PUT — pass
 * the complete payload, not a partial. The `id` lives in the path.
 */
export async function updateConnectorRule(
  opts: SailpointClientOptions,
  id: string,
  payload: ConnectorRulePayload,
): Promise<CreateOrUpdateRuleResult> {
  const result = await sailpointFetch<ConnectorRule>(
    opts,
    `/v2025/connector-rules/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!result.ok) return mapError(result.error);
  return { ok: true, id: result.data.id, data: result.data };
}

/**
 * Delete a connector rule.
 *
 * ISC rejects the DELETE with 409 when the rule is still attached to a
 * source (unlike transforms, which delete even when referenced). The
 * caller still surfaces attachment count up front, but must also handle a
 * 409 coming back from a concurrent attach.
 */
export async function deleteConnectorRule(
  opts: SailpointClientOptions,
  id: string,
): Promise<DeleteRuleResult> {
  const result = await sailpointFetch<unknown>(
    opts,
    `/v2025/connector-rules/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!result.ok) {
    const m = mapError(result.error);
    return { ok: false, status: m.status, message: m.message };
  }
  return { ok: true };
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
