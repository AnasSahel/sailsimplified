import Link from "next/link";

import { Pill } from "@/components/ui/pill";
import type {
  CorrelationConfig,
  SchemaMappings,
  SourceDetail,
} from "@/lib/sailpoint/sources-api";
import { cn } from "@/lib/utils";

import { OverviewActionStub } from "./overview-action-stub";
import { SourceProvisioningBanner } from "./source-provisioning-banner";
import { TypeIcon, TypePill } from "../../../_components/type-pill";

import type { SourceTransformConsumer } from "@/lib/sailpoint/source-attribute-consumers";

/**
 * `<SourceProvisioningTab>` (issue #269) — Provisioning tab on the source
 * detail page.
 *
 * Layout:
 *   - Top banner: read-only vs write-back, driven by `source.authoritative`.
 *   - Authoritative sources → 3 policy cards (attribute mapping, create
 *     identity rule, correlation rule).
 *   - Non-authoritative sources → 4 placeholder action-policy cards
 *     (Create / Update / Disable / Delete), disabled with v2 tooltip.
 *   - Both flavours → "Transforms used on this source" table below the cards.
 *
 * Server Component — composition only. The disabled action stubs that need
 * tooltips delegate to `<OverviewActionStub>` (same client island as the
 * Overview Danger zone).
 *
 * Empty-state policy: when an authoritative source returns `null` for any
 * of the three data sources (schema mappings / matched identity profile /
 * correlation config), the corresponding card still renders with an explicit
 * "no data" message — they're never conditionally hidden. The ISC paths
 * used by #288's factory aren't yet validated against a live tenant
 * (different from the public v2025 OpenAPI spec); rendering empty rather
 * than blank lets us ship the UI shell before path validation lands.
 */
export type IdentityProfileForProvisioning = {
  id: string;
  name: string;
  /** Number of identity-attribute transforms defined on the profile. */
  attributeTransformsCount: number | null;
};

export function SourceProvisioningTab({
  source,
  schemaMappings,
  identityProfile,
  correlationConfig,
  transformConsumers,
}: {
  source: SourceDetail;
  schemaMappings: SchemaMappings | null;
  identityProfile: IdentityProfileForProvisioning | null;
  correlationConfig: CorrelationConfig | null;
  transformConsumers: SourceTransformConsumer[];
}) {
  const authoritative = Boolean(source.authoritative);

  return (
    <div className="space-y-6">
      <SourceProvisioningBanner authoritative={authoritative} />

      {authoritative ? (
        <div className="grid grid-cols-1 gap-4 min-[960px]:grid-cols-3">
          <AttributeMappingCard mappings={schemaMappings} />
          <CreateIdentityRuleCard identityProfile={identityProfile} />
          <CorrelationRuleCard config={correlationConfig} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2 min-[960px]:grid-cols-4">
          <AccountPolicyStubCard
            label="Create account"
            tooltip="Surface the Create account policy. Coming in epic v2 (#182)."
          />
          <AccountPolicyStubCard
            label="Update account"
            tooltip="Surface the Update account policy. Coming in epic v2 (#182)."
          />
          <AccountPolicyStubCard
            label="Disable account"
            tooltip="Surface the Disable account policy. Coming in epic v2 (#182)."
          />
          <AccountPolicyStubCard
            label="Delete account"
            tooltip="Surface the Delete account policy. Coming in epic v2 (#182)."
          />
        </div>
      )}

      <TransformsUsedTable consumers={transformConsumers} />
    </div>
  );
}

// ============================================================
// Policy cards — authoritative source
// ============================================================

function AttributeMappingCard({
  mappings,
}: {
  mappings: SchemaMappings | null;
}) {
  const entries = mappings?.attributes ?? [];
  const hasEntries = entries.length > 0;

  return (
    <CardShell
      title="Identity attribute mapping"
      subtitle={hasEntries ? `${entries.length} attrs` : null}
      action={
        <OverviewActionStub
          label="Edit"
          tooltip="Edit attribute mapping. Coming in epic v2 (#182)."
        />
      }
    >
      {hasEntries ? (
        <ul className="divide-y">
          {entries.slice(0, 8).map((entry, i) => (
            <AttributeMappingRow key={i} entry={entry} />
          ))}
          {entries.length > 8 ? (
            <li className="px-4 py-2 si-caption text-muted-foreground">
              + {entries.length - 8} more
            </li>
          ) : null}
        </ul>
      ) : (
        <EmptyState
          message={
            mappings === null
              ? "No mapping returned for this source."
              : "No attribute mappings configured."
          }
        />
      )}
    </CardShell>
  );
}

function AttributeMappingRow({
  entry,
}: {
  entry: NonNullable<SchemaMappings["attributes"]>[number];
}) {
  // ISC payloads vary by connector — accept both `source` (raw schema
  // attribute) and `name` (display label) for the left-hand side, and
  // `target` for the mapped identity attribute.
  const left =
    (typeof entry.source === "string" && entry.source) ||
    (typeof entry.name === "string" && entry.name) ||
    "—";
  const right =
    typeof entry.target === "string" && entry.target ? entry.target : null;

  return (
    <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2 si-caption">
      <span className="truncate font-mono text-foreground" title={left}>
        {left}
      </span>
      <span className="text-muted-foreground" aria-hidden>
        →
      </span>
      <span
        className={cn(
          "truncate text-right",
          right ? "font-mono text-foreground" : "text-muted-foreground",
        )}
        title={right ?? "unmapped"}
      >
        {right ?? "—"}
      </span>
    </li>
  );
}

function CreateIdentityRuleCard({
  identityProfile,
}: {
  identityProfile: IdentityProfileForProvisioning | null;
}) {
  return (
    <CardShell
      title="Create identity rule"
      subtitle={
        identityProfile?.attributeTransformsCount != null
          ? `${identityProfile.attributeTransformsCount} transforms`
          : null
      }
      action={
        <OverviewActionStub
          label="Edit"
          tooltip="Edit the create-identity rule. Coming in epic v2 (#182)."
        />
      }
    >
      {identityProfile ? (
        <dl className="divide-y">
          <KvRowView
            label="Identity profile"
            value={
              <Link
                href={`/sailpoint/identity-profiles/${encodeURIComponent(identityProfile.id)}`}
                className="text-primary hover:underline"
              >
                {identityProfile.name}
              </Link>
            }
          />
          <KvRowView
            label="Attribute transforms"
            value={
              identityProfile.attributeTransformsCount == null
                ? null
                : String(identityProfile.attributeTransformsCount)
            }
          />
        </dl>
      ) : (
        <EmptyState message="No identity profile is attached to this source as its authoritative source." />
      )}
    </CardShell>
  );
}

function CorrelationRuleCard({
  config,
}: {
  config: CorrelationConfig | null;
}) {
  const assignments = config?.attributeAssignments ?? [];
  const hasAssignments = assignments.length > 0;

  return (
    <CardShell
      title="Correlation rule"
      subtitle={hasAssignments ? `${assignments.length} rules` : null}
      action={
        <OverviewActionStub
          label="Edit"
          tooltip="Edit the correlation rule. Coming in epic v2 (#182)."
        />
      }
    >
      {hasAssignments ? (
        <ul className="divide-y">
          {assignments.slice(0, 8).map((assignment, i) => (
            <CorrelationRow key={i} assignment={assignment} />
          ))}
          {assignments.length > 8 ? (
            <li className="px-4 py-2 si-caption text-muted-foreground">
              + {assignments.length - 8} more
            </li>
          ) : null}
        </ul>
      ) : (
        <EmptyState
          message={
            config === null
              ? "No correlation config returned for this source."
              : "No correlation rules configured."
          }
        />
      )}
    </CardShell>
  );
}

function CorrelationRow({
  assignment,
}: {
  assignment: NonNullable<CorrelationConfig["attributeAssignments"]>[number];
}) {
  const account = assignment.property ?? "—";
  const identity = assignment.value ?? "—";
  const op = assignment.operation ?? "EQ";

  return (
    <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2 si-caption">
      <span className="truncate font-mono text-foreground" title={account}>
        {account}
      </span>
      <span
        className="si-micro uppercase text-muted-foreground"
        aria-hidden
      >
        {op}
      </span>
      <span
        className="truncate text-right font-mono text-foreground"
        title={identity}
      >
        {identity}
      </span>
    </li>
  );
}

// ============================================================
// Account policy stubs — non-authoritative source
// ============================================================

function AccountPolicyStubCard({
  label,
  tooltip,
}: {
  label: string;
  tooltip: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <header className="border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">{label}</h2>
      </header>
      <div className="space-y-2 px-4 py-4">
        <p className="si-caption text-muted-foreground">
          Not surfaced yet — coming in epic v2 (#182).
        </p>
        <OverviewActionStub label="View policy" tooltip={tooltip} />
      </div>
    </section>
  );
}

// ============================================================
// Transforms used on this source — table
// ============================================================

function TransformsUsedTable({
  consumers,
}: {
  consumers: SourceTransformConsumer[];
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">Transforms used on this source</h2>
        {consumers.length > 0 ? (
          <Pill tone="neutral">{consumers.length}</Pill>
        ) : null}
      </header>
      {consumers.length === 0 ? (
        <EmptyState message="No transforms reference this source." />
      ) : (
        <ul className="divide-y" role="list">
          {consumers.map((c) => (
            <TransformsUsedRow key={c.id} consumer={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TransformsUsedRow({
  consumer,
}: {
  consumer: SourceTransformConsumer;
}) {
  const attrs = consumer.attributesReferenced;
  const preview = attrs.slice(0, 3);
  const overflow = attrs.length - preview.length;

  return (
    <li>
      <Link
        href={`/sailpoint/transforms/${encodeURIComponent(consumer.id)}`}
        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,3fr)] items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2 font-mono si-caption">
          <TypeIcon type={consumer.type} />
          <span className="truncate">{consumer.name}</span>
        </span>
        <span className="min-w-0">
          <TypePill type={consumer.type} />
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 justify-self-end text-right si-caption text-muted-foreground sm:justify-self-stretch sm:text-left">
          <span className="font-mono tabular-nums text-foreground">
            {attrs.length}
          </span>
          <span className="text-muted-foreground/70">·</span>
          {preview.map((a) => (
            <Pill key={a} tone="neutral" mono>
              {a}
            </Pill>
          ))}
          {overflow > 0 ? (
            <span className="text-muted-foreground">+{overflow} more</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

// ============================================================
// Local primitives
// ============================================================

function CardShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-sm font-medium">{title}</h2>
          {subtitle ? (
            <span className="si-micro uppercase tracking-wider text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-6 si-body text-muted-foreground">{message}</div>
  );
}

function KvRowView({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-0.5 px-4 py-2 sm:grid-cols-[40%_1fr] sm:items-baseline sm:gap-3">
      <dt className="si-caption text-muted-foreground">{label}</dt>
      <dd className="si-body break-words text-foreground">
        {value === null || value === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
