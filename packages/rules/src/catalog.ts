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
  return {
    type,
    label: type,
    displayLabel: displayLabel ?? humanizeRuleType(type),
    description:
      description ??
      "Connector rule executed in the SailPoint cloud, attached to a source.",
    group: ruleGroupFor(type).slug,
  };
}

/** Every catalogued connector-rule type (for filter option lists, docs). */
export const KNOWN_RULE_TYPES: ReadonlyArray<ConnectorRuleType> = Object.keys(
  DESCRIPTIONS,
) as ConnectorRuleType[];
