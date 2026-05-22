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
import { ruleGroupFor, type RuleGroupSlug } from "./groups";
import type { ConnectorRuleType } from "./types";

export type RuleCatalogEntry = {
  type: string;
  /** Human label (defaults to the raw type when uncatalogued). */
  label: string;
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
 * Resolve catalog metadata for a connector-rule type. Falls back to a
 * generic entry for uncatalogued types so the surface never blanks out.
 */
export function getRuleCatalogEntry(type: string): RuleCatalogEntry {
  const description = (DESCRIPTIONS as Record<string, string>)[type];
  return {
    type,
    label: type,
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
