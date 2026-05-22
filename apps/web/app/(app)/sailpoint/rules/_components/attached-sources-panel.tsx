"use client";

import * as React from "react";
import { AlertTriangle, Database } from "lucide-react";

import type { RuleUsageEntry } from "@simplified-identity/rules";

/**
 * Attached-sources panel in the rule drawer.
 *
 * Renders the sources that attach this rule (the v1 read view). The
 * bidirectional attach/detach write (#354) was deliberately deferred out
 * of the v2 authoring epic: connector-rule↔source attachment is NOT a
 * uniform typed slot — it varies per connector (the reason the usages
 * walker is heuristic), so writing it blindly could corrupt a source
 * config. It needs its own design against a live tenant and is tracked
 * separately. This panel stays read-only.
 */
export function AttachedSourcesPanel({
  attachments,
  usagesAvailable,
}: {
  attachments: ReadonlyArray<RuleUsageEntry>;
  usagesAvailable: boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="si-micro uppercase tracking-wider text-muted-foreground">
        {`Attached sources${usagesAvailable ? ` (${attachments.length})` : ""}`}
      </h3>
      {!usagesAvailable ? (
        <p className="si-caption text-muted-foreground/70">
          Source attachments couldn’t be computed.
        </p>
      ) : attachments.length === 0 ? (
        <p className="si-caption text-muted-foreground/70">
          Not attached to any source.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={`${a.sourceId}:${a.attachmentPath}`}
              className="flex items-center gap-2 si-caption"
            >
              <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate text-foreground">{a.sourceName}</span>
              <span className="truncate font-mono text-muted-foreground/60">
                {a.attachmentPath}
              </span>
              {a.matchedBy === "name" ? (
                <span
                  className="inline-flex items-center gap-1 text-muted-foreground/60"
                  title="Matched on rule name (heuristic), not id"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
