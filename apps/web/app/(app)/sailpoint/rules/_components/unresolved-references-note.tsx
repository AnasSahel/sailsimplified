import { Info } from "lucide-react";

import type { UnresolvedRuleReference } from "@simplified-identity/rules";

/**
 * Neutral, informational note (#347) — source rule-slot references that
 * don't resolve to any rule in the **connector-rules inventory**.
 *
 * Deliberately NOT framed as an error. v1 only fetches connector rules
 * (`/v2025/connector-rules`); a source can legitimately reference a generic
 * **cloud rule** (`BeforeProvisioning`, `ManagerCorrelation`, …) that lives
 * in `/beta/rules` — explicitly out of v1 scope per epic #341. We can't tell
 * a deleted connector rule from a valid cloud rule here, so we surface these
 * as "not connector rules" rather than "missing / will fail". A future v1.x
 * that also fetches `/beta/rules` can promote a genuine subset to "missing".
 */
export function UnresolvedReferencesNote({
  unresolved,
}: {
  unresolved: ReadonlyArray<UnresolvedRuleReference>;
}) {
  if (unresolved.length === 0) return null;

  const bySource = new Map<string, UnresolvedRuleReference[]>();
  for (const u of unresolved) {
    const list = bySource.get(u.sourceName) ?? [];
    list.push(u);
    bySource.set(u.sourceName, list);
  }

  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 px-4 py-3">
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="space-y-1">
        <div className="si-body font-medium">
          {unresolved.length} source rule{" "}
          {unresolved.length === 1 ? "reference" : "references"} outside this
          inventory
        </div>
        <p className="si-caption text-muted-foreground">
          These sources reference a rule that isn’t a connector rule — most
          likely a generic cloud rule (BeforeProvisioning, ManagerCorrelation,
          …), which this read-only v1 view doesn’t list. Shown for awareness,
          not as an error.
        </p>
        <ul className="space-y-0.5 si-caption text-muted-foreground">
          {Array.from(bySource.entries()).map(([sourceName, refs]) => (
            <li key={sourceName} className="font-mono">
              {sourceName} → {refs.map((r) => r.reference).join(", ")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
