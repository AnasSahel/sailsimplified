/**
 * Conceptual grouping for connector-rule types — the analog of
 * `packages/transforms/src/groups.ts`.
 *
 * ISC exposes ~22 distinct connector-rule `type` values. Grouping the
 * list by the raw `type` (like the transforms list does) is the primary
 * view; this higher-level bucket exists so the catalog and filters can
 * also offer a coarser "by phase" lens ("show me all the provisioning
 * rules") without the user memorising every connector-specific type name.
 *
 * If ISC ever ships a native grouping, swap `ruleGroupFor` and the rest
 * of the app keeps working.
 */

export const RULE_GROUPS = {
  aggregation: { slug: "aggregation", label: "Aggregation" },
  provisioning: { slug: "provisioning", label: "Provisioning" },
  correlation: { slug: "correlation", label: "Correlation" },
  customization: { slug: "customization", label: "Customization" },
  webservice: { slug: "webservice", label: "Web Services" },
  other: { slug: "other", label: "Other" },
} as const satisfies Record<string, { slug: string; label: string }>;

export type RuleGroupSlug = keyof typeof RULE_GROUPS;
export type RuleGroup = (typeof RULE_GROUPS)[RuleGroupSlug];

/**
 * Maps each known `ConnectorRuleType` to a conceptual group. Unknown /
 * future types fall through to `other` via `ruleGroupFor`.
 *
 *  - **aggregation** — runs while reading accounts from the source
 *    (BuildMap-family: transforms the raw connector object into the
 *    account schema).
 *  - **provisioning** — runs while writing back to the source
 *    (before/after create-modify-delete, operation provisioning).
 *  - **correlation** — attaches incoming accounts/managers to identities.
 *  - **customization** — connector-object / permission shaping that isn't
 *    strictly aggregation or provisioning.
 *  - **webservice** — the Web Services connector's pre/post operation hooks.
 */
const TYPE_TO_GROUP: Record<string, RuleGroupSlug> = {
  // Aggregation (BuildMap family — raw connector object → account schema)
  BuildMap: "aggregation",
  JDBCBuildMap: "aggregation",
  PeopleSoftHRMSBuildMap: "aggregation",
  SAPBuildMap: "aggregation",
  // Provisioning (write-back lifecycle hooks)
  ConnectorAfterCreate: "provisioning",
  ConnectorAfterDelete: "provisioning",
  ConnectorAfterModify: "provisioning",
  ConnectorBeforeCreate: "provisioning",
  ConnectorBeforeDelete: "provisioning",
  ConnectorBeforeModify: "provisioning",
  JDBCOperationProvisioning: "provisioning",
  JDBCProvision: "provisioning",
  PeopleSoftHRMSOperationProvisioning: "provisioning",
  PeopleSoftHRMSProvision: "provisioning",
  SapHrOperationProvisioning: "provisioning",
  SapHrProvision: "provisioning",
  SuccessFactorsOperationProvisioning: "provisioning",
  // Correlation (account/manager → identity attachment)
  SapHrManagerRule: "correlation",
  // Customization (connector object / permission shaping)
  RACFPermissionCustomization: "customization",
  ResourceObjectCustomization: "customization",
  // Web Services connector hooks
  WebServiceAfterOperationRule: "webservice",
  WebServiceBeforeOperationRule: "webservice",
};

export function ruleGroupFor(type: string): RuleGroup {
  const slug = TYPE_TO_GROUP[type] ?? "other";
  return RULE_GROUPS[slug];
}

export function ruleGroupSlugFromParam(
  value: string | undefined,
): RuleGroupSlug | null {
  if (!value) return null;
  return value in RULE_GROUPS ? (value as RuleGroupSlug) : null;
}
