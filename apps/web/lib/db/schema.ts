import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// better-auth core tables — names and columns are dictated by the lib.
// Keep camelCase here on purpose (lib expectation), exception to the
// snake_case-DB rule.

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" })
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("activeOrganizationId"),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});

// better-auth organization plugin tables

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  metadata: text("metadata"),
});

export const member = sqliteTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

export const invitation = sqliteTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  inviterId: text("inviterId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

// App-domain tables — snake_case columns, camelCase TS keys
// (cf. CLAUDE.md + memory feedback_drizzle_snake_case_db).

/**
 * Identity-attribute drift snapshot (issue #207).
 *
 * One row per identity attribute that the snapshot has computed a
 * null-population ratio for. Snapshot is written by the
 * `refreshIdentityAttributeDrift` server action (manual button on the
 * list page; future cron). The UI surfaces (KPI strip card 4, row
 * badge, `?scope=drift` filter, detail KPI) all read from this table —
 * no SailPoint API call on render.
 *
 * Tier thresholds (locked by the ADR
 * `vault/Projects/Simplified Identity/2026-05-14-identity-attribute-drift-strategy.md`):
 *   - `ok`      : nullRatio < 0.05
 *   - `warning` : 0.05 ≤ nullRatio ≤ 0.20
 *   - `danger`  : nullRatio > 0.20
 *
 * `mappingProfileIds` records which identity profiles mapped the
 * attribute at capture time — surfaced for future debug (per-profile
 * breakdown, snapshot invalidation when the mapping changes) without
 * costing an extra read on the hot path.
 */
export const identityAttributeDriftSnapshot = sqliteTable(
  "identity_attribute_drift_snapshot",
  {
    attributeName: text("attribute_name").primaryKey(),
    populatedCount: integer("populated_count").notNull(),
    totalCount: integer("total_count").notNull(),
    nullRatio: real("null_ratio").notNull(),
    tier: text("tier", { enum: ["ok", "warning", "danger"] }).notNull(),
    mappingProfileIds: text("mapping_profile_ids", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    capturedAt: integer("captured_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    tierIdx: index("idx_drift_snapshot_tier").on(table.tier),
  }),
);

/**
 * Per-source audit log (issues #270 / #271).
 *
 * Append-only timeline of mutations originated from this app's UI for a
 * given ISC source. Complements the ISC events index (which captures
 * connector-side activity but loses the better-auth `userId` of the
 * human initiator). The Activity tab merges both streams at read time
 * via `listSourceActivity`.
 *
 * Schema locked by the ADR
 * `vault/Projects/Simplified Identity/2026-05-14-sources-activity-audit-shape.md`
 * (D2 + D4 + D6):
 *  - `sourceName` denormalised so the row stays readable after the
 *    source is renamed or deleted in ISC.
 *  - `actorUserId` FK with `onDelete: "set null"` — keep audit trail
 *    even if the user is removed; UI falls back to `actorLabelFallback`.
 *  - `severity` stored at write time, not derived from `action`, so a
 *    later re-classification doesn't rewrite history.
 *  - `beforeSnapshot` / `afterSnapshot` are JSON blobs persisted on
 *    write; sensitive keys (passwords, tokens, …) are redacted by
 *    `appendSourceAuditEvent` before insertion.
 *  - `metadata` is free-form per action — `{ taskId, durationMs, ... }`.
 *  - `occurredAt` decoupled from `createdAt` so deferred / backfilled
 *    inserts stay possible (none in v1, but the schema allows it).
 */
export const sourceAuditEvent = sqliteTable(
  "source_audit_event",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    action: text("action", {
      enum: [
        "source.renamed",
        "source.owner_changed",
        "source.description_updated",
        "source.aggregation_triggered",
        "source.connection_tested",
        "source.connector_attributes_updated",
        "source.schema_drift_detected",
        "source.paused",
        "source.resumed",
        "source.deleted",
      ],
    }).notNull(),
    severity: text("severity", {
      enum: ["info", "warning", "danger"],
    }).notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorLabelFallback: text("actor_label_fallback"),
    summary: text("summary").notNull(),
    beforeSnapshot: text("before_snapshot"),
    afterSnapshot: text("after_snapshot"),
    metadata: text("metadata"),
    occurredAt: integer("occurred_at").notNull(),
    createdAt: integer("created_at")
      .$defaultFn(() => Date.now())
      .notNull(),
  },
  (table) => ({
    sourceIdx: index("idx_source_audit_source").on(
      table.sourceId,
      table.occurredAt,
    ),
    actionIdx: index("idx_source_audit_action").on(table.action),
    actorIdx: index("idx_source_audit_actor").on(table.actorUserId),
    occurredAtIdx: index("idx_source_audit_occurred_at").on(table.occurredAt),
  }),
);

/**
 * Saved Test-run fixtures for a transform (issue #327, epic #321).
 *
 * One row per (userId, transformId, name). The Test tab uses these to
 * let the user name and stash a complete test setup (input value +
 * simulated context attribute values) for re-use across drawer reopens
 * and across sessions. Per-user (matching the tenant-settings + lint
 * scoping pattern — every SailPoint fetcher takes `userId`, so org-level
 * sharing is out of scope of this v1).
 *
 * `inputValue` is the raw textarea content (a string, since transforms
 * always evaluate against a string input).
 *
 * `simulatedValues` is a JSON map keyed by `RequiredSimulationInput.id`
 * (e.g. `account.AD.firstname`, `identity.cloudLifecycleState`) → string.
 * Keeps full fidelity with what the evaluator consumes so loading a
 * fixture is a strict deep-equal restore.
 *
 * Decision: see ADR
 * `vault/Projects/Simplified Identity/2026-05-14-drawer-workspace-mode.md`
 * §Test inputs persistence (extended to "named saved fixtures" here per
 * issue #327 §Save/load test fixtures).
 */
export const transformTestFixture = sqliteTable(
  "transform_test_fixture",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    transformId: text("transform_id").notNull(),
    name: text("name").notNull(),
    inputValue: text("input_value").notNull().default(""),
    simulatedValues: text("simulated_values", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    uniqueName: uniqueIndex("idx_transform_test_fixture_uniq").on(
      table.userId,
      table.transformId,
      table.name,
    ),
    byTransform: index("idx_transform_test_fixture_by_transform").on(
      table.userId,
      table.transformId,
    ),
  }),
);

/**
 * Per-tenant configuration knobs. One row per user since the data layer
 * is per-user (every SailPoint fetcher takes `userId`); better-auth's
 * organization plugin is enabled but no resource is currently scoped by
 * org id. Columns are nullable on purpose — a tenant with no row reads
 * defaults from the corresponding constant. Future issues #107 / #108
 * add `externalProfileIds` and `preboardLcsNames` columns here.
 */
export const tenantSettings = sqliteTable("tenant_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  aggregationFreshnessThresholdHours: integer(
    "aggregation_freshness_threshold_hours",
  ),
  /**
   * Whether the user has dismissed the one-time data-egress notice that
   * appears before the first "Explain with AI" call (epic #373 / #377).
   *
   * Nullable so existing rows (created before this column existed) read
   * `null`, which the application treats as "not yet dismissed" — same
   * behaviour as a fresh row with no entry. Set to `1` on first explicit
   * user confirmation.
   *
   * ⚠️ Do NOT remove or default this to `true`: the notice informs users
   * that the rule's BeanShell source is sent to Anthropic. Silently
   * dismissing it would violate the privacy posture of this feature.
   */
  explainNoticeDismissed: integer("explain_notice_dismissed", {
    mode: "boolean",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

/**
 * Per-user "quick samples" attached to a SailPoint transform (issue #69,
 * Phase 2 — hybrid auto-extract + user-saved). One row per saved sample;
 * the Test tab in the transform editor renders these as clickable chips
 * that pre-fill the INPUT textarea.
 *
 * Auto-extracted samples (e.g. `lookup` table keys) live in code, not
 * here — see `@simplified-identity/transforms` `extractAutoSamples`.
 * This table only stores values the user explicitly clicked "Save as
 * sample" on after a successful Run.
 *
 * Scoping is per-user (every fetcher in this app is already userId-keyed)
 * — never cross-user, even within the same org. Values can carry PII
 * (employee IDs, emails) so leakage would be a real privacy issue.
 *
 * `transformId` is the opaque ISC transform id (string). "new" transforms
 * (not yet persisted) have no stable id and therefore can't be saved
 * against — the editor masks the "Save as sample" button in that mode.
 */
export const transformSample = sqliteTable(
  "transform_samples",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    transformId: text("transform_id").notNull(),
    value: text("value").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    userTransformIdx: index("idx_transform_samples_user_transform").on(
      table.userId,
      table.transformId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Source schema drift (issue #265).
//
// Two tables. `source_schema_snapshot` is one row per (user, source,
// schemaName, attributeName) — the baseline used for diffing on every
// fetch. `source_meta` is one row per (user, source) — coarse per-source
// timestamps (baseline reset + last fetch) used to render badges and to
// drive the "ok"/"warn"/"err" age thresholds (D1 of the ADR).
//
// ADR: `vault/Projects/Simplified Identity/2026-05-14-sources-schema-drift-detection.md`.
// ---------------------------------------------------------------------------

/**
 * Per-attribute drift baseline. One row per
 * (user, source, schemaName, attrName).
 *
 * Tier semantics (D4 of the ADR):
 *  - `ok`   — attribute present, unchanged since last fetch
 *  - `info` — first time the attribute was seen (new attribute)
 *  - `warn` — type or description changed (recoverable), OR the
 *    attribute hasn't been seen for ≥1 day and <7 days
 *  - `err`  — multi-valued / entitlement / required / correlationKey
 *    flag flipped, OR the attribute hasn't been seen for ≥7 days
 *
 * Rows are never deleted by the capture path — the disappearance of an
 * attribute is itself the signal. Only `resetSourceSchemaBaseline`
 * wipes rows for a given (source, schemaName).
 *
 * `first_seen_at` / `last_seen_at` / `changed_at` are unix ms. Stored as
 * `integer` (not `timestamp`) because we want raw epoch values readable
 * outside the JS process (drizzle's `timestamp` mode multiplies on read
 * and we surface these to client components).
 */
export const sourceSchemaSnapshot = sqliteTable(
  "source_schema_snapshot",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    sourceId: text("source_id").notNull(),
    schemaName: text("schema_name").notNull(),
    attrName: text("attr_name").notNull(),
    attrType: text("attr_type"),
    isMulti: integer("is_multi").notNull().default(0),
    isEntitlement: integer("is_entitlement").notNull().default(0),
    isRequired: integer("is_required").notNull().default(0),
    correlationKey: integer("correlation_key").notNull().default(0),
    description: text("description"),
    tier: text("tier", { enum: ["ok", "info", "warn", "err"] }).notNull(),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    changedAt: integer("changed_at"),
  },
  (table) => ({
    uniqAttr: uniqueIndex("idx_source_schema_snapshot_uniq").on(
      table.userId,
      table.sourceId,
      table.schemaName,
      table.attrName,
    ),
    perSource: index("idx_source_schema_snapshot_source").on(
      table.userId,
      table.sourceId,
    ),
    // Future cross-source "drifted attributes" view (D6) — keep the
    // tier filter cheap from day one.
    perTier: index("idx_source_schema_snapshot_tier").on(
      table.userId,
      table.sourceId,
      table.tier,
    ),
  }),
);

/**
 * Per-source baseline metadata. One row per (user, source). Stamped
 * whenever the baseline is reset (`resetSourceSchemaBaseline`) and on
 * every capture-and-compare run (`last_fetched_at`). Used by the UI to
 * show "Baseline reset 3 days ago" / "Last fetched <relative>".
 *
 * Decoupled from `source_schema_snapshot` so the per-source timestamps
 * don't have to be denormalised on every snapshot row.
 */
export const sourceMeta = sqliteTable(
  "source_meta",
  {
    userId: text("user_id").notNull(),
    sourceId: text("source_id").notNull(),
    schemaBaselineAt: integer("schema_baseline_at"),
    lastFetchedAt: integer("last_fetched_at"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.sourceId] }),
  }),
);

/**
 * Cached AI explanation for a connector rule source (epic #373).
 *
 * Keyed by (scopeKey, sourceHash) so:
 *   - Same source across rules within the same scope hits the cache.
 *   - An edit to the rule's sourceCode changes its SHA-256 hash, which
 *     naturally invalidates the old entry (new hash → cache miss → fresh call).
 *
 * `scopeKey` is either the active organisation id or the userId when no
 * org is active (the same dual-scope pattern as the transforms lint cache).
 * `sourceHash` is the hex SHA-256 of the raw `sourceCode` string.
 *
 * Rows are upserted on every new explanation; no explicit invalidation
 * path needed — the hash is the invalidation key.
 */
export const explanationCache = sqliteTable(
  "explanation_cache",
  {
    scopeKey: text("scope_key").notNull(),
    sourceHash: text("source_hash").notNull(),
    explanation: text("explanation").notNull(),
    model: text("model").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.scopeKey, table.sourceHash] }),
  }),
);

// ---------------------------------------------------------------------------
// Contractors (epic #423, phase 1 — issue #424).
// ---------------------------------------------------------------------------

export const contractor = sqliteTable(
  "contractor",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    startDate: text("start_date"),
    endDate: text("end_date"),
    sponsorUserId: text("sponsor_user_id")
      .notNull()
      .references(() => user.id),
    status: text("status", {
      enum: ["active", "expired", "terminated"],
    })
      .notNull()
      .default("active"),
    externalRef: text("external_ref"),
    attributes: text("attributes").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    orgDeletedIdx: index("idx_contractor_org_deleted").on(
      table.organizationId,
      table.deletedAt,
    ),
    orgEmailActiveUniq: uniqueIndex("idx_contractor_org_email_active")
      .on(table.organizationId, table.email)
      .where(sql`${table.deletedAt} IS NULL`),
    orgSponsorIdx: index("idx_contractor_org_sponsor").on(
      table.organizationId,
      table.sponsorUserId,
    ),
  }),
);

export const apiToken = sqliteTable(
  "api_token",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    lastUsedAt: integer("last_used_at"),
    createdAt: integer("created_at").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    revokedAt: integer("revoked_at"),
  },
  (table) => ({
    orgIdx: index("idx_api_token_org").on(table.organizationId),
    tokenHashUniq: uniqueIndex("idx_api_token_hash").on(table.tokenHash),
  }),
);
