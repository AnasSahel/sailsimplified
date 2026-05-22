/**
 * Best-effort extractors for fields buried inside `source.connectorAttributes`.
 *
 * Connector configs are per-connector and ISC has no canonical contract — keys
 * vary across `OpenConnector`, `DelimitedFile`, `WebServices`, vendor SaaS
 * connectors, etc. These helpers probe the most common keys used by the
 * connectors we've seen on tenants we operate, and return `null` when nothing
 * recognizable is found so callers can render `—`.
 *
 * Kept as a server/client-neutral module so it can be imported from server
 * components (e.g. `page.tsx`) and from client components (e.g. a future
 * "Edit configuration" drawer) without dragging `"use client"` boundaries.
 */

type Attrs = Record<string, unknown> | undefined | null;

function pickString(attrs: Attrs, keys: readonly string[]): string | null {
  if (!attrs) return null;
  for (const key of keys) {
    const v = attrs[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/**
 * Schedule cadence label parsed from common keys (`cron`, `schedule`,
 * `frequency`, `aggregationSchedule`). The real scheduling lives in the
 * `/v2025/schedules` collection — until that's wired we surface what the
 * connector exposes inline.
 */
export function parseScheduleFromConnectorAttributes(
  attrs: Attrs,
): string | null {
  return pickString(attrs, [
    "cron",
    "schedule",
    "frequency",
    "aggregationSchedule",
  ]);
}

/** Auth method label (`OAuth2`, `BasicAuth`, etc.) — best effort. */
export function parseAuthTypeFromConnectorAttributes(
  attrs: Attrs,
): string | null {
  return pickString(attrs, [
    "authenticationMethod",
    "authType",
    "auth_type",
    "authenticationType",
    "grant_type",
    "grantType",
  ]);
}

/** Tenant / instance URL (`host`, `url`, `instanceUrl`, …). */
export function parseTenantUrlFromConnectorAttributes(
  attrs: Attrs,
): string | null {
  return pickString(attrs, [
    "host",
    "url",
    "instanceUrl",
    "instance_url",
    "baseUrl",
    "base_url",
    "endpoint",
    "tenantUrl",
    "tenant_url",
    "domain",
  ]);
}

/**
 * OAuth scopes — connectors expose this as either a space-separated string,
 * a comma-separated string, or an array. Returns the normalized space-joined
 * form, or `null` if absent / empty.
 */
export function parseScopesFromConnectorAttributes(
  attrs: Attrs,
): string | null {
  if (!attrs) return null;
  const candidates = ["scopes", "scope", "oauthScopes", "oauth_scopes"];
  for (const key of candidates) {
    const v = attrs[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (Array.isArray(v)) {
      const items = v
        .filter((x): x is string => typeof x === "string" && x.length > 0)
        .map((s) => s.trim());
      if (items.length > 0) return items.join(" ");
    }
  }
  return null;
}

/**
 * Identity refresh policy — usually `refreshPolicy` or `identityRefreshPolicy`
 * if exposed at all (most connectors don't surface this inline).
 */
export function parseRefreshPolicyFromConnectorAttributes(
  attrs: Attrs,
): string | null {
  return pickString(attrs, [
    "identityRefreshPolicy",
    "refreshPolicy",
    "refresh_policy",
  ]);
}

/** Time zone if the connector exposes one (`timezone`, `tz`, …). */
export function parseTimeZoneFromConnectorAttributes(
  attrs: Attrs,
): string | null {
  return pickString(attrs, ["timezone", "timeZone", "tz", "scheduleTimezone"]);
}

// ============================================================
// Per-connector classification + raw <dl> masking heuristics
// ============================================================

/**
 * Connector families we render a typed view for. Anything else falls
 * through to the raw `<dl>` view in `<ConfigurationCard>`.
 *
 * Detection probes `connector` (internal id, lowercase-kebab) first, then
 * `connectorName` / `type` as a fallback — ISC isn't consistent about
 * which field carries the canonical identifier across `OpenConnector`,
 * `DelimitedFile`, web-service, and vendor-SaaS sources.
 */
export type ConnectorFamily =
  | "onelogin"
  | "active-directory"
  | "delimited-file"
  | "unknown";

export function classifyConnector(input: {
  connector?: string | null;
  connectorName?: string | null;
  type?: string | null;
}): ConnectorFamily {
  const haystack = [input.connector, input.connectorName, input.type]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.toLowerCase())
    .join(" ");
  if (!haystack) return "unknown";
  if (haystack.includes("onelogin")) return "onelogin";
  if (
    haystack.includes("active-directory") ||
    haystack.includes("active directory") ||
    haystack.includes("activedirectory")
  ) {
    return "active-directory";
  }
  if (
    haystack.includes("delimitedfile") ||
    haystack.includes("delimited file") ||
    haystack.includes("delimited-file") ||
    haystack.includes("csv")
  ) {
    return "delimited-file";
  }
  return "unknown";
}

/**
 * Heuristic for "this value should be masked in the raw fallback view".
 *
 * Matches on the *key* only — we never want to keyword-scan values
 * because user-provided field labels can be arbitrary and false-positives
 * on values would silently hide useful config. Generic substrings only
 * — never tenant or client identifiers.
 */
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /secret/i,
  /password/i,
  /passwd/i,
  /\btoken\b/i,
  /\bapi[-_]?key\b/i,
  /private[-_]?key/i,
  /credential/i,
  /\bauth\b/i, // catches "authToken", "authHeader", "authValue"
  /encrypted/i,
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

/**
 * Mask a value for display. Always returns a non-empty string — empty /
 * null values still surface as `(empty)` so the operator can tell the
 * difference between "secret set but masked" and "field never filled".
 */
export function maskValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string" && value.length === 0) return "(empty)";
  return "••••••••";
}

/**
 * Render any connectorAttribute value for the raw `<dl>` fallback. Strings
 * pass through; arrays/objects get a JSON serialization; booleans and
 * numbers stringify. Long strings are returned as-is — `<KvList>` handles
 * wrap/truncate at the row level.
 */
export function formatRawAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    return value.length > 0 ? value : "—";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // Arrays + objects — best-effort compact JSON.
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
