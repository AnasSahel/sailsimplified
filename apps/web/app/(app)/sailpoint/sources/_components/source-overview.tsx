import Link from "next/link";

import { Pill } from "@/components/ui/pill";
import type { SourceDetail } from "@/lib/sailpoint/sources-api";

import { OverviewActionStub } from "./overview-action-stub";
import {
  classifyConnector,
  type ConnectorFamily,
  formatRawAttributeValue,
  isSensitiveKey,
  maskValue,
  parseAuthTypeFromConnectorAttributes,
  parseRefreshPolicyFromConnectorAttributes,
  parseScheduleFromConnectorAttributes,
  parseScopesFromConnectorAttributes,
  parseTenantUrlFromConnectorAttributes,
  parseTimeZoneFromConnectorAttributes,
} from "./source-config-helpers";

/**
 * `<SourceOverview>` — 2-column overview of a source.
 *
 * History:
 *   - #185 introduced the 2-col layout + side cards.
 *   - #257 refines the Configuration card into per-connector typed views
 *     (OneLogin / Active Directory / Delimited file) with a raw `<dl>`
 *     fallback (+ secret masking) for unknown connectors.
 *
 * Layout (`grid-template-columns: 2fr 1fr` on `lg+`, single column under
 * 1024px):
 *   - Left  → Configuration card (typed body or raw fallback) + Health
 *             placeholder + Aggregation history placeholder. Health and
 *             Aggregation history land in Phase 3; placeholders are
 *             intentionally discreet, not aggressive disabled states.
 *   - Right → sticky side-stack: Identity profile, Schedule, Owners,
 *             Danger zone (action stubs disabled with tooltips referencing
 *             epic #182).
 *
 * The previous KPI-grid (correlation rate, attribute coverage, accounts
 * total, since) was migrated to the 5-stat strip rendered above the tabs
 * (issue #184) — it is intentionally NOT re-rendered here.
 *
 * Server component: no client state, just composition. The danger-zone
 * and schedule action stubs that need a tooltip live in their own client
 * island (`<OverviewActionStub>`) so we don't have to wrap the entire
 * page in a `TooltipProvider`.
 */
export function SourceOverview({
  source,
  identityProfile,
}: {
  source: SourceDetail;
  identityProfile: IdentityProfileForOverview | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr] lg:gap-6">
      <div className="space-y-4 min-w-0">
        <ConfigurationCard source={source} />
        <HealthPlaceholderCard />
        <AggregationHistoryPlaceholderCard />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <IdentityProfileCard
          identityProfile={identityProfile}
          authoritative={Boolean(source.authoritative)}
        />
        <ScheduleCard source={source} />
        <OwnersCard source={source} />
        <DangerZoneCard />
      </aside>
    </div>
  );
}

// ============================================================
// Identity profile prop shape
// ============================================================

/**
 * Subset of `IdentityProfileSummary` (+ a couple of attempted enrichments)
 * that the side card actually renders. Kept narrow so `page.tsx` can shape
 * exactly what's needed and we don't import the `sailpoint-client` type
 * (which would couple the UI to the package surface).
 */
export type IdentityProfileForOverview = {
  id: string;
  name: string;
  /**
   * Identity count attached to this profile. Best effort — `/v2025/identity-profiles`
   * doesn't expose a count, and computing it would require an extra
   * `/v2025/identities` query per profile. `null` until that lookup is wired.
   */
  identitiesCount?: number | null;
  /**
   * Number of lifecycle states defined on the profile. Best effort — only
   * present if upstream fetched the full profile object (not the summary).
   */
  lifecycleStatesCount?: number | null;
  /** Default LCS technical name if surfaced by upstream. */
  defaultState?: string | null;
};

// ============================================================
// Cards — Left column
// ============================================================

function ConfigurationCard({ source }: { source: SourceDetail }) {
  const family = classifyConnector({
    connector: source.connector,
    connectorName: source.connectorName,
    type: source.type,
  });

  // Header rows are always rendered, regardless of connector — these come
  // from source-level fields, not `connectorAttributes`.
  const connectorLabel =
    [source.connectorName, source.connector].filter(Boolean).join(" · ") ||
    null;
  const accountCorrelation = source.accountCorrelationConfig?.name ?? null;
  const managerCorrelation = source.managerCorrelationRule?.name ?? null;

  const headerRows: KvRow[] = [
    { label: "Connector", value: connectorLabel },
    { label: "Account correlation rule", value: accountCorrelation },
    { label: "Manager correlation", value: managerCorrelation },
  ];

  return (
    <CardShell title="Configuration" subtitle={connectorFamilyLabel(family)}>
      <KvList rows={headerRows} />
      <div className="border-t">
        <ConfigurationBody source={source} family={family} />
      </div>
    </CardShell>
  );
}

/**
 * Compact label for the card subtitle indicating whether we picked up a
 * typed view or fell back to the raw `<dl>`. Helpful when debugging
 * heterogeneous ISC tenants — at a glance the operator can tell whether
 * the typed parser fired.
 */
function connectorFamilyLabel(family: ConnectorFamily): string {
  switch (family) {
    case "onelogin":
      return "OneLogin";
    case "active-directory":
      return "Active Directory";
    case "delimited-file":
      return "Delimited file";
    case "unknown":
      return "Raw";
  }
}

function ConfigurationBody({
  source,
  family,
}: {
  source: SourceDetail;
  family: ConnectorFamily;
}) {
  switch (family) {
    case "onelogin":
      return <OneLoginConfigBody source={source} />;
    case "active-directory":
      return <ActiveDirectoryConfigBody source={source} />;
    case "delimited-file":
      return <DelimitedFileConfigBody source={source} />;
    case "unknown":
      return <RawConfigBody source={source} />;
  }
}

// ============================================================
// Per-connector typed bodies
// ============================================================

function OneLoginConfigBody({ source }: { source: SourceDetail }) {
  const attrs = source.connectorAttributes ?? {};
  const authType = parseAuthTypeFromConnectorAttributes(attrs);
  // OneLogin region + subdomain — checked first so they're not swallowed
  // by the generic tenant-url parser. Falls back to whichever the
  // connector exposed.
  const subdomain = pickStringAttr(attrs, [
    "subdomain",
    "tenantSubdomain",
    "tenant_subdomain",
    "instance",
  ]);
  const region = pickStringAttr(attrs, ["region", "shard"]);
  const tenantUrl = parseTenantUrlFromConnectorAttributes(attrs);
  const clientId = pickStringAttr(attrs, [
    "client_id",
    "clientId",
    "oauthClientId",
    "oauth_client_id",
  ]);
  const scopes = parseScopesFromConnectorAttributes(attrs);
  const refreshPolicy = parseRefreshPolicyFromConnectorAttributes(attrs);

  const rows: KvRow[] = [
    { label: "Auth type", value: authType },
    { label: "Subdomain", value: subdomain, mono: Boolean(subdomain) },
    { label: "Region", value: region },
    { label: "API URL", value: tenantUrl, mono: true, truncate: true },
    { label: "OAuth client ID", value: clientId, mono: Boolean(clientId) },
    { label: "Scopes", value: scopes, mono: true, wrap: true },
    { label: "Identity refresh policy", value: refreshPolicy },
  ];
  return <KvList rows={rows} />;
}

function ActiveDirectoryConfigBody({ source }: { source: SourceDetail }) {
  const attrs = source.connectorAttributes ?? {};
  const authType = parseAuthTypeFromConnectorAttributes(attrs);
  const host = pickStringAttr(attrs, [
    "host",
    "server",
    "hostname",
    "ldapHost",
    "primaryHost",
  ]);
  const port = pickStringAttr(attrs, ["port", "ldapPort"]);
  const domain = pickStringAttr(attrs, [
    "domain",
    "domainName",
    "domain_name",
    "ADDomain",
  ]);
  const baseDn = pickStringAttr(attrs, [
    "searchDN",
    "search_dn",
    "baseDN",
    "base_dn",
    "userSearchDN",
    "iqServiceHost",
  ]);
  const bindUser = pickStringAttr(attrs, [
    "user",
    "username",
    "bindDN",
    "bind_dn",
    "serviceAccount",
  ]);
  const useSsl = pickStringAttr(attrs, ["useSSL", "use_ssl", "ssl", "secure"]);
  const refreshPolicy = parseRefreshPolicyFromConnectorAttributes(attrs);

  const rows: KvRow[] = [
    { label: "Auth type", value: authType },
    { label: "Server", value: host, mono: Boolean(host), truncate: true },
    { label: "Port", value: port, mono: Boolean(port) },
    { label: "Domain", value: domain, mono: Boolean(domain) },
    { label: "Search DN", value: baseDn, mono: Boolean(baseDn), wrap: true },
    {
      label: "Bind user",
      value: bindUser,
      mono: Boolean(bindUser),
      truncate: true,
    },
    { label: "SSL", value: useSsl },
    { label: "Identity refresh policy", value: refreshPolicy },
  ];
  return <KvList rows={rows} />;
}

function DelimitedFileConfigBody({ source }: { source: SourceDetail }) {
  const attrs = source.connectorAttributes ?? {};
  const fileName = pickStringAttr(attrs, [
    "file",
    "fileName",
    "filename",
    "file_path",
    "filePath",
  ]);
  const delimiter = pickStringAttr(attrs, [
    "delimiter",
    "fieldDelimiter",
    "field_delimiter",
  ]);
  const quoteChar = pickStringAttr(attrs, ["quoteChar", "quote_char", "quote"]);
  const hasHeader = pickStringAttr(attrs, [
    "hasHeader",
    "has_header",
    "header",
    "includeHeader",
  ]);
  const encoding = pickStringAttr(attrs, ["encoding", "charset"]);
  const refreshPolicy = parseRefreshPolicyFromConnectorAttributes(attrs);

  const rows: KvRow[] = [
    { label: "File", value: fileName, mono: Boolean(fileName), truncate: true },
    { label: "Delimiter", value: delimiter, mono: Boolean(delimiter) },
    { label: "Quote char", value: quoteChar, mono: Boolean(quoteChar) },
    { label: "Has header", value: hasHeader },
    { label: "Encoding", value: encoding },
    { label: "Identity refresh policy", value: refreshPolicy },
  ];
  return <KvList rows={rows} />;
}

/**
 * Raw fallback for connectors we don't classify. Renders every entry of
 * `connectorAttributes` as a `<dl>` row, masking values whose key looks
 * sensitive (`secret`, `token`, `password`, `apikey`, …) per the generic
 * heuristic in `isSensitiveKey`.
 *
 * Never crashes on missing / empty attributes — if the bag is empty, we
 * surface a discreet placeholder.
 */
function RawConfigBody({ source }: { source: SourceDetail }) {
  const attrs = source.connectorAttributes;
  if (!attrs || typeof attrs !== "object") {
    return (
      <div className="px-4 py-4 si-body text-muted-foreground">
        No connector attributes exposed by this source.
      </div>
    );
  }

  // Sort keys for stable rendering — operators reading the raw view
  // benefit from an alphabetical scan more than from whatever insertion
  // order ISC returned.
  const entries = Object.entries(attrs).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  if (entries.length === 0) {
    return (
      <div className="px-4 py-4 si-body text-muted-foreground">
        No connector attributes exposed by this source.
      </div>
    );
  }

  const rows: KvRow[] = entries.map(([key, value]) => {
    const sensitive = isSensitiveKey(key);
    return {
      label: key,
      value: sensitive ? maskValue(value) : formatRawAttributeValue(value),
      mono: true,
      // Strings can be arbitrarily long for unknown connectors; wrap
      // instead of truncate so the value stays readable.
      wrap: true,
    };
  });

  return <KvList rows={rows} />;
}

/**
 * Local typed pick — same shape as `pickString` in `source-config-helpers`
 * but exported helpers there are already case-specific. Kept inline here
 * to avoid widening the helper module surface for a tiny utility used
 * only by these per-connector bodies.
 */
function pickStringAttr(
  attrs: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const v = attrs[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "Yes" : "No";
  }
  return null;
}

function HealthPlaceholderCard() {
  return (
    <CardShell title="Health" subtitle="Phase 3">
      <div className="px-4 py-6 si-body text-muted-foreground">
        Health monitoring lands in Phase 3.
      </div>
    </CardShell>
  );
}

function AggregationHistoryPlaceholderCard() {
  return (
    <CardShell title="Aggregation history" subtitle="Phase 3">
      <div className="px-4 py-6 si-body text-muted-foreground">
        Aggregation history lands in Phase 3.
      </div>
    </CardShell>
  );
}

// ============================================================
// Cards — Right column (side-stack)
// ============================================================

function IdentityProfileCard({
  identityProfile,
  authoritative,
}: {
  identityProfile: IdentityProfileForOverview | null;
  authoritative: boolean;
}) {
  if (!identityProfile) {
    return (
      <CardShell title="Identity profile">
        <div className="px-4 py-4 si-body text-muted-foreground">
          {authoritative
            ? "No identity profile resolved for this authoritative source."
            : "Not an authoritative source."}
        </div>
      </CardShell>
    );
  }

  const rows: KvRow[] = [
    {
      label: "Name",
      value: (
        <Link
          href={`/sailpoint/identity-profiles/${encodeURIComponent(identityProfile.id)}`}
          className="text-primary hover:underline"
        >
          {identityProfile.name}
        </Link>
      ),
    },
    {
      label: "Identities",
      value:
        identityProfile.identitiesCount === undefined ||
        identityProfile.identitiesCount === null
          ? null
          : String(identityProfile.identitiesCount),
    },
    {
      label: "Lifecycle states",
      value:
        identityProfile.lifecycleStatesCount === undefined ||
        identityProfile.lifecycleStatesCount === null
          ? null
          : String(identityProfile.lifecycleStatesCount),
    },
    {
      label: "Default state",
      value: identityProfile.defaultState ?? null,
    },
  ];

  return (
    <CardShell title="Identity profile">
      <KvList rows={rows} compact />
    </CardShell>
  );
}

function ScheduleCard({ source }: { source: SourceDetail }) {
  const cadence = parseScheduleFromConnectorAttributes(
    source.connectorAttributes,
  );
  const timeZone = parseTimeZoneFromConnectorAttributes(
    source.connectorAttributes,
  );

  const rows: KvRow[] = [
    { label: "Cadence", value: cadence, mono: Boolean(cadence) },
    { label: "Next run", value: null },
    { label: "Time zone", value: timeZone },
    { label: "Last 30 d", value: null },
  ];

  return (
    <CardShell title="Schedule">
      <KvList rows={rows} compact />
      <div className="border-t px-4 py-3">
        <OverviewActionStub
          label="Edit schedule"
          tooltip="Configure aggregation cadence. Coming in v2 (epic #182)."
        />
      </div>
    </CardShell>
  );
}

function OwnersCard({ source }: { source: SourceDetail }) {
  const owner = source.owner ?? null;
  // ISC sometimes attaches a "managementWorkgroup"-like field on the source;
  // it isn't part of our typed surface, so we only render `cluster` for now.
  const cluster = source.cluster ?? null;

  const rows: KvRow[] = [
    {
      label: "Owner",
      value: owner ? (
        <Link
          href={`/sailpoint/identities/${encodeURIComponent(owner.id)}`}
          className="text-primary hover:underline"
        >
          {owner.name}
        </Link>
      ) : null,
    },
    {
      label: "Cluster",
      value: cluster?.name ?? null,
    },
  ];

  return (
    <CardShell title="Owners">
      <KvList rows={rows} compact />
    </CardShell>
  );
}

function DangerZoneCard() {
  return (
    <section className="overflow-hidden rounded-lg border border-destructive/40 bg-card">
      <header className="flex items-center justify-between border-b border-destructive/20 bg-destructive/5 px-4 py-2.5">
        <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
        <Pill tone="warning">v2</Pill>
      </header>
      <div className="space-y-2 px-4 py-4">
        <OverviewActionStub
          label="Pause aggregation"
          tooltip="Pause aggregation and provisioning. Coming in v2 (epic #182)."
        />
        <OverviewActionStub
          label="Reset correlation"
          tooltip="Drop existing identity links and re-correlate. Coming in v2 (epic #182)."
        />
        <OverviewActionStub
          label="Delete source"
          tooltip="Permanently remove this source from the tenant. Coming in v2 (epic #182)."
          variant="destructive"
        />
      </div>
    </section>
  );
}

// ============================================================
// Local primitives
// ============================================================

type KvRow = {
  label: React.ReactNode;
  value: React.ReactNode | null;
  mono?: boolean;
  truncate?: boolean;
  wrap?: boolean;
};

function CardShell({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {subtitle ? (
          <span className="si-micro uppercase tracking-wider text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function KvList({ rows, compact }: { rows: KvRow[]; compact?: boolean }) {
  return (
    <dl className="divide-y">
      {rows.map((row, i) => (
        <KvRowView key={i} row={row} compact={compact} />
      ))}
    </dl>
  );
}

function KvRowView({ row, compact }: { row: KvRow; compact?: boolean }) {
  const valueClass = [
    "si-body break-words text-foreground",
    row.mono ? "font-mono text-xs" : "",
    row.truncate ? "truncate" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const display: React.ReactNode =
    row.value === null || row.value === undefined ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      row.value
    );

  return (
    <div
      className={
        compact
          ? "grid grid-cols-1 gap-0.5 px-4 py-2 sm:grid-cols-[40%_1fr] sm:items-baseline sm:gap-3"
          : "grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[40%_1fr] sm:items-baseline sm:gap-3"
      }
    >
      <dt className="si-caption text-muted-foreground">{row.label}</dt>
      <dd className={valueClass}>{display}</dd>
    </div>
  );
}
