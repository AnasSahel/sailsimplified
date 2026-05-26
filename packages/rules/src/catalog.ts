/**
 * Known connector-rule types — label, one-line purpose, and the typical
 * source-attachment slot. Powers the drawer ("what does this rule type
 * do?"), the type pill label, and the grouping eyebrow.
 *
 * The catalog is descriptive, not authoritative: a rule of an
 * uncatalogued `type` still renders (via `getRuleCatalogEntry`'s
 * fallback) — it just shows the raw type as its own label with a generic
 * description. ISC adding a new connector-rule type therefore never
 * breaks the surface.
 */
import { ruleGroupFor, type RuleGroupSlug } from "./groups.ts";
import type { ConnectorRuleType } from "./types";

export type LifecycleStage = "BEFORE" | "DURING" | "AFTER";

export type LifecycleStep = {
  /** Short title for the step (e.g. "Raw row read", "This rule runs here"). */
  label: string;
  /** One-line sub-description shown below the label. */
  sub: string;
};

/**
 * Lifecycle data for the `WHEN IT FIRES` card (#406 / epic #401).
 *
 * Each rule type maps to a 3-step description of the broader operation the
 * rule participates in. The middle step (`steps[1]`) is always the rule
 * itself — that's what the UI highlights. `stage` summarises the rule's
 * position (BEFORE / DURING / AFTER) and `stageDescription` is a one-paragraph
 * plain-English explanation.
 */
export type RuleLifecycle = {
  stage: LifecycleStage;
  stageDescription: string;
  steps: readonly [LifecycleStep, LifecycleStep, LifecycleStep];
};

export type RuleCatalogEntry = {
  type: string;
  /** Human label (defaults to the raw type when uncatalogued). */
  label: string;
  /**
   * Friendly, prose-cased label for the rule type — e.g.
   * `WebServiceAfterOperationRule` → "After Operation Rule". This is ours,
   * not an ISC field. Consumed by the drawer header pill + the PROPERTIES
   * grid (with the raw `type` kept beside it as secondary greyed text).
   * Falls back to a humanised split of the raw type for uncatalogued types.
   */
  displayLabel: string;
  /** One-line plain-English purpose. */
  description: string;
  /** Conceptual group slug (derived from `ruleGroupFor`). */
  group: RuleGroupSlug;
  /**
   * Lifecycle metadata for the `WHEN IT FIRES` card. Absent for
   * uncatalogued types — the UI renders a graceful fallback.
   */
  lifecycle?: RuleLifecycle;
};

/**
 * Per-type descriptions. Keyed by the canonical `ConnectorRuleType`. The
 * label is derived from the key (the type names are already readable) so
 * we only store the description here.
 */
const DESCRIPTIONS: Record<ConnectorRuleType, string> = {
  BuildMap:
    "Transforms a raw connector record into the account schema during aggregation.",
  JDBCBuildMap:
    "BuildMap for the JDBC connector — maps a result-set row into the account schema.",
  PeopleSoftHRMSBuildMap:
    "BuildMap for the PeopleSoft HRMS connector — shapes the HR record into the account schema.",
  SAPBuildMap:
    "BuildMap for the SAP connector — maps the SAP object into the account schema.",
  ConnectorBeforeCreate:
    "Runs just before an account is created on the source during provisioning.",
  ConnectorAfterCreate:
    "Runs just after an account is created on the source during provisioning.",
  ConnectorBeforeModify:
    "Runs just before an account is modified on the source during provisioning.",
  ConnectorAfterModify:
    "Runs just after an account is modified on the source during provisioning.",
  ConnectorBeforeDelete:
    "Runs just before an account is deleted on the source during provisioning.",
  ConnectorAfterDelete:
    "Runs just after an account is deleted on the source during provisioning.",
  JDBCOperationProvisioning:
    "Customizes a provisioning operation for the JDBC connector.",
  JDBCProvision:
    "Implements the full provisioning logic for the JDBC connector.",
  PeopleSoftHRMSOperationProvisioning:
    "Customizes a provisioning operation for the PeopleSoft HRMS connector.",
  PeopleSoftHRMSProvision:
    "Implements provisioning for the PeopleSoft HRMS connector.",
  SapHrOperationProvisioning:
    "Customizes a provisioning operation for the SAP HR connector.",
  SapHrProvision: "Implements provisioning for the SAP HR connector.",
  SuccessFactorsOperationProvisioning:
    "Customizes a provisioning operation for the SuccessFactors connector.",
  SapHrManagerRule:
    "Resolves the manager relationship for SAP HR accounts during correlation.",
  RACFPermissionCustomization:
    "Customizes how RACF permissions are read into entitlements.",
  ResourceObjectCustomization:
    "Customizes the raw connector object before it is processed.",
  WebServiceBeforeOperationRule:
    "Runs before a Web Services connector operation — shape the request.",
  WebServiceAfterOperationRule:
    "Runs after a Web Services connector operation — shape the response.",
};

/**
 * Friendly per-type labels. The connector prefix that disambiguates the
 * *type* (`WebService…`, `Connector…`) is dropped from the label — the
 * connector is already surfaced separately (the group / Connector row), so
 * the label answers "which lifecycle hook is this?" in plain words.
 * Connector families that own the name (JDBC, SAP HR, PeopleSoft HRMS,
 * SuccessFactors, RACF) keep it.
 */
const DISPLAY_LABELS: Record<ConnectorRuleType, string> = {
  BuildMap: "Build Map",
  JDBCBuildMap: "JDBC Build Map",
  PeopleSoftHRMSBuildMap: "PeopleSoft HRMS Build Map",
  SAPBuildMap: "SAP Build Map",
  ConnectorBeforeCreate: "Before Create",
  ConnectorAfterCreate: "After Create",
  ConnectorBeforeModify: "Before Modify",
  ConnectorAfterModify: "After Modify",
  ConnectorBeforeDelete: "Before Delete",
  ConnectorAfterDelete: "After Delete",
  JDBCOperationProvisioning: "JDBC Operation Provisioning",
  JDBCProvision: "JDBC Provision",
  PeopleSoftHRMSOperationProvisioning: "PeopleSoft HRMS Operation Provisioning",
  PeopleSoftHRMSProvision: "PeopleSoft HRMS Provision",
  SapHrOperationProvisioning: "SAP HR Operation Provisioning",
  SapHrProvision: "SAP HR Provision",
  SuccessFactorsOperationProvisioning: "SuccessFactors Operation Provisioning",
  SapHrManagerRule: "SAP HR Manager Rule",
  RACFPermissionCustomization: "RACF Permission Customization",
  ResourceObjectCustomization: "Resource Object Customization",
  WebServiceBeforeOperationRule: "Before Operation Rule",
  WebServiceAfterOperationRule: "After Operation Rule",
};

// ── Lifecycle templates ──────────────────────────────────────────────────────
//
// Rule types group naturally into a handful of lifecycle shapes (aggregation
// build, provisioning before / after, web service before / after, …). Each
// template is reused across the rule types that share the same shape, keyed
// in LIFECYCLES below. Authoring is concise: one paragraph + three steps per
// shape, not per type.

const AGGREGATION_BUILD: RuleLifecycle = {
  stage: "DURING",
  stageDescription:
    "Runs once per resource object during aggregation. Normalise attributes, derive identities, drop garbage rows — anything between raw read and ingestion.",
  steps: [
    { label: "Raw row read", sub: "Connector pulls one record from the source" },
    { label: "This rule runs here", sub: "During source aggregation" },
    { label: "Account / group built", sub: "Resource object passed to ISC" },
  ],
};

const PROV_BEFORE: RuleLifecycle = {
  stage: "BEFORE",
  stageDescription:
    "Runs before the connector applies a provisioning change. Inspect or transform the outgoing request — add attributes, remap values, log context.",
  steps: [
    {
      label: "Provisioning request",
      sub: "ISC issues the change to the connector",
    },
    {
      label: "This rule runs here",
      sub: "Before the connector sends to the target",
    },
    {
      label: "Vendor receives request",
      sub: "Modified request applied on the source",
    },
  ],
};

const PROV_AFTER: RuleLifecycle = {
  stage: "AFTER",
  stageDescription:
    "Runs after the connector applies a provisioning change. Inspect the result, log, or trigger downstream actions before ISC commits the new state.",
  steps: [
    {
      label: "Vendor applies change",
      sub: "Source system processes the request",
    },
    {
      label: "This rule runs here",
      sub: "After the vendor responds, before ISC commits",
    },
    {
      label: "Result returned to ISC",
      sub: "Account / group state synced",
    },
  ],
};

const PROV_OPERATION: RuleLifecycle = {
  stage: "DURING",
  stageDescription:
    "Implements or customises a provisioning operation for this connector family. Runs as part of the connector's provisioning path on every operation.",
  steps: [
    { label: "ISC issues request", sub: "Provisioning operation begins" },
    { label: "This rule runs here", sub: "Connector executes the operation" },
    { label: "Operation complete", sub: "Result returned to ISC" },
  ],
};

const WS_BEFORE: RuleLifecycle = {
  stage: "BEFORE",
  stageDescription:
    "Runs before the Web Services connector issues an HTTP request. Shape the URL, headers, or body before it leaves the VA.",
  steps: [
    { label: "Request assembled", sub: "Endpoint and body built from config" },
    { label: "This rule runs here", sub: "Just before the HTTP call" },
    { label: "Vendor API called", sub: "Outbound request sent" },
  ],
};

const WS_AFTER: RuleLifecycle = {
  stage: "AFTER",
  stageDescription:
    "Runs after the Web Services connector receives a response. Parse, transform, or filter the vendor payload before ISC ingests it.",
  steps: [
    { label: "Vendor responds", sub: "HTTP response received" },
    {
      label: "This rule runs here",
      sub: "After the response, before ISC parses it",
    },
    {
      label: "ISC processes response",
      sub: "Parsed account / entitlement data",
    },
  ],
};

const ENTITLEMENT_BUILD: RuleLifecycle = {
  stage: "DURING",
  stageDescription:
    "Runs during entitlement aggregation. Shape how source permissions or group attributes are read into ISC entitlements.",
  steps: [
    {
      label: "Raw permission read",
      sub: "Connector reads the source permission",
    },
    { label: "This rule runs here", sub: "During entitlement aggregation" },
    { label: "Entitlement built", sub: "Permission/group surfaced to ISC" },
  ],
};

const MANAGER_RESOLVE: RuleLifecycle = {
  stage: "DURING",
  stageDescription:
    "Resolves manager relationships during correlation. Runs as ISC links HR records to identity managers.",
  steps: [
    { label: "HR record read", sub: "Account aggregated from the source" },
    { label: "This rule runs here", sub: "During manager resolution" },
    { label: "Manager linked", sub: "Identity relationship saved" },
  ],
};

/**
 * Per-type lifecycle assignment. Uncatalogued types fall through to
 * `undefined`, and the UI renders a graceful "lifecycle unknown" fallback.
 */
const LIFECYCLES: Partial<Record<ConnectorRuleType, RuleLifecycle>> = {
  BuildMap: AGGREGATION_BUILD,
  JDBCBuildMap: AGGREGATION_BUILD,
  PeopleSoftHRMSBuildMap: AGGREGATION_BUILD,
  SAPBuildMap: AGGREGATION_BUILD,
  ResourceObjectCustomization: AGGREGATION_BUILD,

  ConnectorBeforeCreate: PROV_BEFORE,
  ConnectorBeforeModify: PROV_BEFORE,
  ConnectorBeforeDelete: PROV_BEFORE,

  ConnectorAfterCreate: PROV_AFTER,
  ConnectorAfterModify: PROV_AFTER,
  ConnectorAfterDelete: PROV_AFTER,

  JDBCOperationProvisioning: PROV_OPERATION,
  JDBCProvision: PROV_OPERATION,
  PeopleSoftHRMSOperationProvisioning: PROV_OPERATION,
  PeopleSoftHRMSProvision: PROV_OPERATION,
  SapHrOperationProvisioning: PROV_OPERATION,
  SapHrProvision: PROV_OPERATION,
  SuccessFactorsOperationProvisioning: PROV_OPERATION,

  WebServiceBeforeOperationRule: WS_BEFORE,
  WebServiceAfterOperationRule: WS_AFTER,

  RACFPermissionCustomization: ENTITLEMENT_BUILD,
  SapHrManagerRule: MANAGER_RESOLVE,
};

/**
 * Best-effort prose split of an uncatalogued PascalCase type — inserts
 * spaces at lower→upper and acronym→Word boundaries so a future ISC type
 * like `FooBarBuildMap` still renders as "Foo Bar Build Map" rather than a
 * raw enum. Acronym runs (`JDBC`, `RACF`, `HRMS`) stay glued.
 */
export function humanizeRuleType(type: string): string {
  return type
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

/**
 * Resolve catalog metadata for a connector-rule type. Falls back to a
 * generic entry for uncatalogued types so the surface never blanks out.
 */
export function getRuleCatalogEntry(type: string): RuleCatalogEntry {
  const description = (DESCRIPTIONS as Record<string, string>)[type];
  const displayLabel = (DISPLAY_LABELS as Record<string, string>)[type];
  const lifecycle = (LIFECYCLES as Record<string, RuleLifecycle>)[type];
  return {
    type,
    label: type,
    displayLabel: displayLabel ?? humanizeRuleType(type),
    description:
      description ??
      "Connector rule executed in the SailPoint cloud, attached to a source.",
    group: ruleGroupFor(type).slug,
    lifecycle,
  };
}

/** Every catalogued connector-rule type (for filter option lists, docs). */
export const KNOWN_RULE_TYPES: ReadonlyArray<ConnectorRuleType> = Object.keys(
  DESCRIPTIONS,
) as ConnectorRuleType[];
