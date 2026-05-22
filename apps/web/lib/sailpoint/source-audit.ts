import "server-only";

import { db, schema } from "@/lib/db";

/**
 * Per-source audit log writer + redaction helper.
 *
 * Backs the Activity tab (#270) via `listSourceActivity` (#271).
 * Schema and behaviour locked by the ADR
 * `vault/Projects/Simplified Identity/2026-05-14-sources-activity-audit-shape.md`:
 *
 *  - `appendSourceAuditEvent` is the single write entry-point. Future
 *    server actions (rename, owners change, aggregation trigger, etc.)
 *    call it after their happy path.
 *  - `redactSecrets` walks the `before` / `after` snapshots and replaces
 *    values whose keys match a small whitelist of sensitive substrings
 *    (passwords, tokens, …) — mirrors the per-connector Configuration
 *    masking heuristic used in `source-overview.tsx` (see
 *    `source-config-helpers.ts → isSensitiveKey`).
 *  - The writer never throws — audit must not crash the originating
 *    server action. Failures are swallowed (logged) so the metier path
 *    keeps its semantics.
 */

export type SourceAuditAction =
  | "source.renamed"
  | "source.owner_changed"
  | "source.description_updated"
  | "source.aggregation_triggered"
  | "source.connection_tested"
  | "source.connector_attributes_updated"
  | "source.schema_drift_detected"
  | "source.paused"
  | "source.resumed"
  | "source.deleted";

export type SourceAuditSeverity = "info" | "warning" | "danger";

/**
 * Default severity per audit action — locked at write time per the ADR
 * (severity is stored, not derived at render, so a later re-classification
 * doesn't rewrite history). Callers can override via `severity` if a
 * specific occurrence is unusually bad (e.g. a failed connection test).
 */
const DEFAULT_SEVERITY: Record<SourceAuditAction, SourceAuditSeverity> = {
  "source.renamed": "info",
  "source.owner_changed": "info",
  "source.description_updated": "info",
  "source.aggregation_triggered": "info",
  "source.connection_tested": "info",
  "source.connector_attributes_updated": "warning",
  "source.schema_drift_detected": "warning",
  "source.paused": "warning",
  "source.resumed": "info",
  "source.deleted": "danger",
};

export type AppendSourceAuditEventInput = {
  sourceId: string;
  sourceName: string;
  action: SourceAuditAction;
  /**
   * Identity of who triggered the action. Either an app user (FK into
   * better-auth's `user` table) or a free-form label (cron, ISC system).
   */
  actor: { userId: string } | { label: string };
  /** Human one-liner shown in the timeline. Truncated to 280 chars. */
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  severity?: SourceAuditSeverity;
  /**
   * Override `occurred_at`. Defaults to `Date.now()`. Useful for
   * back-dating deferred events; v1 never uses it but the schema
   * supports it.
   */
  occurredAt?: number;
};

const SUMMARY_MAX_CHARS = 280;

/**
 * Key-substring patterns that mark a value as sensitive when redacting
 * before/after snapshots. Mirrors `source-config-helpers.ts →
 * SENSITIVE_KEY_PATTERNS` so the same heuristic governs both display
 * masking and persisted-audit redaction. Generic substrings only; never
 * tenant or client identifiers.
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

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

const REDACTED_PLACEHOLDER = "[REDACTED]";

/**
 * Recursively walk an object tree and replace values whose **key** matches
 * a sensitive pattern. Arrays are traversed but their indices are not keys,
 * so array entries are only redacted if they themselves contain sensitive
 * keys deeper down. The redaction matches on the key, never the value —
 * scanning values for "looks-like-a-token" produces false positives on
 * arbitrary user-provided config fields.
 *
 * Returns a fresh object — input is never mutated. Cycles are tolerated
 * via a `WeakSet` guard so a self-referential ISC payload doesn't blow
 * the stack.
 */
export function redactSecrets<T>(value: T): T {
  const seen = new WeakSet<object>();
  function walk(v: unknown): unknown {
    if (v === null || v === undefined) return v;
    if (typeof v !== "object") return v;
    if (seen.has(v as object)) return v;
    seen.add(v as object);

    if (Array.isArray(v)) {
      return v.map(walk);
    }
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(v as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        // Preserve the presence vs absence distinction — empty / null
        // still surface as such for the audit reader.
        if (raw === null || raw === undefined || raw === "") {
          out[key] = raw;
        } else {
          out[key] = REDACTED_PLACEHOLDER;
        }
      } else {
        out[key] = walk(raw);
      }
    }
    return out;
  }
  return walk(value) as T;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function newAuditId(): string {
  // ULID would be nicer (time-prefix → lexicographic chronology) but
  // we don't ship a ULID lib yet. `crypto.randomUUID` is consistent
  // with the rest of the codebase and works in both edge and node.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Extremely defensive fallback — pinned to a `srcaud_` prefix so the
  // collision surface is obvious if it ever fires.
  return `srcaud_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Append one row to `source_audit_event`.
 *
 * Never throws — audit must not crash the originating server action.
 * Errors are caught and console-logged so the action's happy path is
 * preserved. The return value is intentionally `void` so callers don't
 * branch on audit success.
 *
 * Sensitive keys in `before` / `after` are redacted by `redactSecrets`
 * before insertion. Summary is truncated to 280 chars.
 */
export async function appendSourceAuditEvent(
  input: AppendSourceAuditEventInput,
): Promise<void> {
  try {
    const occurredAt = input.occurredAt ?? Date.now();
    const severity = input.severity ?? DEFAULT_SEVERITY[input.action];

    const actorUserId = "userId" in input.actor ? input.actor.userId : null;
    const actorLabelFallback =
      "label" in input.actor ? input.actor.label : null;

    const redactedBefore =
      input.before === undefined || input.before === null
        ? null
        : redactSecrets(input.before);
    const redactedAfter =
      input.after === undefined || input.after === null
        ? null
        : redactSecrets(input.after);

    await db.insert(schema.sourceAuditEvent).values({
      id: newAuditId(),
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      action: input.action,
      severity,
      actorUserId,
      actorLabelFallback,
      summary: truncate(input.summary, SUMMARY_MAX_CHARS),
      beforeSnapshot:
        redactedBefore === null ? null : JSON.stringify(redactedBefore),
      afterSnapshot:
        redactedAfter === null ? null : JSON.stringify(redactedAfter),
      metadata:
        input.metadata === undefined ? null : JSON.stringify(input.metadata),
      occurredAt,
      createdAt: Date.now(),
    });
  } catch (err) {
    // Swallow — audit must not crash callers. Surface via console so
    // operators can spot a misbehaving writer in production logs.
    console.error("[source-audit] write failed", {
      action: input.action,
      sourceId: input.sourceId,
      error: err,
    });
  }
}
