"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * `<ActivityInlineDiff>` — per-entry diff block for the Activity tab.
 *
 * Implementation per issue #270 spec — no diff library in the repo, so
 * we walk the union of `Object.keys(before) ∪ Object.keys(after)` once
 * and emit one or two lines per changed key (`- key: <old>` red, then
 * `+ key: <new>` green). Unchanged keys are skipped.
 *
 * For nested values we JSON.stringify each side rather than recurse —
 * the v0 goal is "good enough for renames, owners, single-attribute
 * config edits" (cf. ADR D6), not a structural diff viewer.
 *
 * Sensitive keys (`password`, `clientSecret`, `apiKey`, `*Token`) are
 * redacted at write-time by `recordSourceAudit` (ADR §Schéma) so they
 * arrive here as `"***redacted***"` and render normally. We don't redact
 * at render-time — that responsibility lives upstream.
 */

type DiffValue = unknown;

type DiffLine =
  | { kind: "removed"; key: string; value: string }
  | { kind: "added"; key: string; value: string }
  | { kind: "unchanged"; key: string; value: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/**
 * Render one value as a short inline string. Primitives stringify
 * directly; objects/arrays fall back to compact JSON. Trims long values
 * to keep timeline rows scannable — the user can click the source row
 * action to inspect the full payload if needed (future work, not v0).
 */
function renderValue(v: DiffValue): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Object / array — compact JSON, length-capped.
  try {
    const s = JSON.stringify(v);
    return s.length > 240 ? `${s.slice(0, 237)}…` : s;
  } catch {
    return String(v);
  }
}

function valuesEqual(a: DiffValue, b: DiffValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Compute the ordered list of diff lines. Insertion order:
 *   - Walk the union of keys preserving `before` order first, then any
 *     keys introduced by `after`.
 *   - For each key:
 *      - missing in `after` → one removed line
 *      - missing in `before` → one added line
 *      - both present, equal → one unchanged line (collapsed by default)
 *      - both present, different → removed then added
 */
function computeDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): DiffLine[] {
  const lines: DiffLine[] = [];
  const seen = new Set<string>();
  const beforeObj = before ?? {};
  const afterObj = after ?? {};

  // Pass 1 — keys in `before` (preserve order).
  for (const key of Object.keys(beforeObj)) {
    seen.add(key);
    const b = beforeObj[key];
    const hasAfter = Object.prototype.hasOwnProperty.call(afterObj, key);
    if (!hasAfter) {
      lines.push({ kind: "removed", key, value: renderValue(b) });
      continue;
    }
    const a = afterObj[key];
    if (valuesEqual(b, a)) {
      lines.push({ kind: "unchanged", key, value: renderValue(b) });
    } else {
      lines.push({ kind: "removed", key, value: renderValue(b) });
      lines.push({ kind: "added", key, value: renderValue(a) });
    }
  }
  // Pass 2 — keys only in `after`.
  for (const key of Object.keys(afterObj)) {
    if (seen.has(key)) continue;
    lines.push({ kind: "added", key, value: renderValue(afterObj[key]) });
  }
  return lines;
}

export function ActivityInlineDiff({
  before,
  after,
  className,
}: {
  before: unknown;
  after: unknown;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  // Normalise both sides into a flat object. Non-object snapshots
  // (string, number, array) get wrapped under a synthetic `value` key
  // so the diff stays scannable even when an action only carries a
  // single scalar (e.g. `description_updated`).
  const beforeObj = isPlainObject(before)
    ? before
    : before == null
      ? null
      : { value: before };
  const afterObj = isPlainObject(after)
    ? after
    : after == null
      ? null
      : { value: after };

  const lines = React.useMemo(
    () => computeDiff(beforeObj, afterObj),
    [beforeObj, afterObj],
  );

  // Heuristic: if there are no changed lines at all, hide the toggle
  // (`<TimelineRow>` should already skip the diff in that case, but
  // belt-and-braces).
  const changedCount = lines.filter((l) => l.kind !== "unchanged").length;
  if (changedCount === 0) return null;

  return (
    <div className={cn("mt-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 si-caption text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden />
        )}
        {open
          ? "Hide diff"
          : `Show diff (${changedCount} change${changedCount === 1 ? "" : "s"})`}
      </button>
      {open && (
        <pre className="mt-1.5 max-h-72 overflow-auto rounded-md border bg-muted/50 p-2 font-mono text-xs leading-relaxed">
          {lines.map((line, idx) => {
            if (line.kind === "unchanged") return null;
            const sign = line.kind === "removed" ? "-" : "+";
            const tone =
              line.kind === "removed"
                ? "text-rose-700 dark:text-rose-300"
                : "text-emerald-700 dark:text-emerald-300";
            return (
              <div key={`${line.kind}-${idx}-${line.key}`} className={tone}>
                <span className="select-none">{sign} </span>
                <span className="font-semibold">{line.key}</span>
                <span>: </span>
                <span className="whitespace-pre-wrap break-all">
                  {line.value}
                </span>
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
}
