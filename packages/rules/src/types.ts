/**
 * Domain types for SailPoint **connector rules** — the cloud-executed
 * BeanShell rules attached to sources (BuildMap, BeforeProvisioning,
 * correlation, …). This package owns the canonical `RuleRecord`; the
 * `sailpoint-client` HTTP layer normalizes its `/v2025/connector-rules`
 * response into this shape, and the web UI + the pure analysis here
 * (`usages.ts`, `lint/`) consume it.
 *
 * Mirrors the `packages/transforms` split: pure types + analysis, no DB,
 * no HTTP. The two packages never import each other.
 *
 * Type coverage is deliberately narrow — only the fields the read-only v1
 * surface actually reads are typed. `attributes` stays a permissive bag
 * because its shape varies per connector-rule type and pretending
 * otherwise would rot fast (same stance as `SourceDetail.connectorAttributes`).
 */

/**
 * The connector-rule `type` discriminator returned by ISC. This is the
 * canonical `ConnectorRuleType` enum (v2025). Kept as a string-literal
 * union so the catalog + grouping can be exhaustive, but every consumer
 * treats `type` as `string` defensively — a future ISC type just
 * materialises as its own (uncatalogued) group rather than crashing.
 */
export type ConnectorRuleType =
  | "BuildMap"
  | "ConnectorAfterCreate"
  | "ConnectorAfterDelete"
  | "ConnectorAfterModify"
  | "ConnectorBeforeCreate"
  | "ConnectorBeforeDelete"
  | "ConnectorBeforeModify"
  | "JDBCBuildMap"
  | "JDBCOperationProvisioning"
  | "JDBCProvision"
  | "PeopleSoftHRMSBuildMap"
  | "PeopleSoftHRMSOperationProvisioning"
  | "PeopleSoftHRMSProvision"
  | "RACFPermissionCustomization"
  | "ResourceObjectCustomization"
  | "SAPBuildMap"
  | "SapHrManagerRule"
  | "SapHrOperationProvisioning"
  | "SapHrProvision"
  | "SuccessFactorsOperationProvisioning"
  | "WebServiceAfterOperationRule"
  | "WebServiceBeforeOperationRule";

/**
 * One declared parameter of a connector rule's signature. ISC returns an
 * `input` array of these plus a single `output` descriptor.
 */
export type RuleSignatureParam = {
  name: string;
  description?: string | null;
  /** Java-ish type the connector passes/expects (e.g. `String`, `sailpoint.object.Application`). */
  type?: string | null;
};

/**
 * The rule's invocation contract — the named arguments the connector
 * binds into the BeanShell scope, and the value it expects back. Optional
 * throughout: some tenant rules carry no signature.
 */
export type RuleSignature = {
  input?: RuleSignatureParam[];
  output?: RuleSignatureParam | null;
};

/**
 * The BeanShell payload. ISC nests the script under `sourceCode.script`
 * with a `version` tag. The list endpoint can return rules without
 * `sourceCode` (it's only included when explicitly requested), so the
 * field is optional and the viewer degrades to "source not loaded".
 */
export type RuleSourceCode = {
  version?: string | null;
  script: string;
};

/**
 * A connector rule as the app consumes it. Structurally a superset of the
 * `RuleLike` the usages walker needs — the walker only reads `id` + `name`,
 * the drawer reads the rest.
 */
export type RuleRecord = {
  id: string;
  name: string;
  description?: string | null;
  /** Canonical `ConnectorRuleType`; typed loosely so unknown future types pass through. */
  type: string;
  signature?: RuleSignature | null;
  sourceCode?: RuleSourceCode | null;
  /** Connector-specific config bag — shape varies per rule type. */
  attributes?: Record<string, unknown> | null;
  created?: string;
  modified?: string;
};

/**
 * Minimal shape the usages walker + lint need. `RuleRecord` is assignable
 * to this — keeps the analysis decoupled from the full record so a future
 * lighter fetch path (ids + names only) can still feed it.
 */
export type RuleLike = {
  id: string;
  name: string;
};
