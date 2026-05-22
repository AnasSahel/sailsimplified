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
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

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
