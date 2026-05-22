"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { deleteTransformSampleAction } from "@/lib/transform-samples/actions";

export type UserSampleChip = {
  id: string;
  value: string;
};

/**
 * Quick samples chip row rendered under the FINAL box in the Test tab.
 *
 * Two sources, rendered in this order:
 *   1. `autoSamples` — derived from the transform spec (e.g. `lookup`
 *      table keys). Stateless, non-removable, neutral styling.
 *   2. `userSamples` — persisted via the `transform_samples` table.
 *      Slightly tinted to distinguish from auto, hover-× to delete.
 *
 * Clicking any chip calls `onSelect(value)` which the parent uses to
 * prefill the INPUT textarea.
 *
 * Phase 1 empty-state placeholder is preserved when BOTH lists are
 * empty — that's the only fully-empty case. The "Save as sample"
 * button lives in the parent (next to the INPUT/Run row), not here, so
 * the user can seed the first sample even when this section is empty.
 */
export function QuickSamples({
  autoSamples,
  userSamples,
  onSelect,
  onUserSampleRemoved,
}: {
  autoSamples: ReadonlyArray<string>;
  userSamples: ReadonlyArray<UserSampleChip>;
  onSelect: (value: string) => void;
  /**
   * Called with the sample id after the server delete succeeds. The
   * parent uses it to update its diff state (the displayed list is
   * derived from `initialUserSamples` minus removed ids).
   */
  onUserSampleRemoved?: (sampleId: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  const empty = autoSamples.length === 0 && userSamples.length === 0;

  async function handleDelete(sampleId: string) {
    setPendingDelete(sampleId);
    try {
      const result = await deleteTransformSampleAction(sampleId);
      if (result.ok && onUserSampleRemoved) {
        onUserSampleRemoved(sampleId);
      }
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <section>
      <h3 className="pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Quick samples
      </h3>
      {empty ? (
        <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 px-3 py-4 text-center text-[11px] text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900/30">
          No quick samples yet. Run with an input you like, then click
          “Save as sample”.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {autoSamples.map((value) => (
            <button
              key={`auto:${value}`}
              type="button"
              onClick={() => onSelect(value)}
              className={cn(
                "inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[11px] text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900",
                "dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
              )}
              title={`Auto-extracted from the transform definition — click to fill INPUT with "${value}"`}
            >
              {value}
            </button>
          ))}
          {userSamples.map((sample) => {
            const isDeleting = pendingDelete === sample.id;
            return (
              <span
                key={`user:${sample.id}`}
                className={cn(
                  "group inline-flex items-center rounded-md border border-blue-200 bg-blue-50 pl-2 pr-0.5 font-mono text-[11px] text-blue-900 transition-colors",
                  "dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200",
                  isDeleting && "opacity-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(sample.value)}
                  className="py-0.5 transition-colors hover:text-blue-700 dark:hover:text-blue-100"
                  disabled={isDeleting}
                  title={`Saved sample — click to fill INPUT with "${sample.value}"`}
                >
                  {sample.value}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(sample.id)}
                  disabled={isDeleting}
                  className={cn(
                    "ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-blue-500/70 opacity-0 transition-all group-hover:opacity-100 hover:bg-blue-100 hover:text-blue-700",
                    "dark:text-blue-300/70 dark:hover:bg-blue-900/40 dark:hover:text-blue-100",
                  )}
                  aria-label={`Remove sample "${sample.value}"`}
                  title="Remove sample"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
