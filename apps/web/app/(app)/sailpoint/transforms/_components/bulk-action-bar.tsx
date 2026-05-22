"use client";

import * as React from "react";
import { Download, FolderPlus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { BulkDeleteDialog } from "./bulk-delete-dialog";
import type { SelectableTransform } from "./types";

/**
 * Sticky bulk action bar — appears above the table when at least one row
 * is selected (#316). Hidden when the selection is empty.
 *
 * Sticky behavior: pinned to the top of the scroll ancestor with
 * `sticky top-0 z-20`. Stays visible while the user scrolls the long
 * transforms list, never overlays a modal.
 *
 * Actions:
 *   - Add to group… — stub (#316 explicitly defers manual grouping;
 *     opens a transient "Coming soon" toast).
 *   - Export JSON — client-side blob download of the selected transforms'
 *     raw definitions (no server round-trip).
 *   - Delete — reuses the existing `<BulkDeleteDialog />` flow, which
 *     filters out internal transforms and blocks on referenced ones.
 *   - X — clears the selection.
 *
 * Selection labels: count + first 3 names + "and N more" overflow.
 */

const PREVIEW_NAMES = 3;

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatNamePreview(selected: ReadonlyArray<SelectableTransform>): string {
  if (selected.length === 0) return "";
  const head = selected.slice(0, PREVIEW_NAMES).map((t) => t.name);
  const overflow = selected.length - head.length;
  if (overflow <= 0) return head.join(", ");
  return `${head.join(", ")} and ${overflow} more`;
}

export function BulkActionBar({
  selected,
  onClear,
}: {
  selected: SelectableTransform[];
  onClear: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  if (selected.length === 0) return null;

  const count = selected.length;
  const deletableCount = selected.filter((t) => !t.internal).length;
  const namePreview = formatNamePreview(selected);

  function showToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }

  function handleExport() {
    // Mirror the SailPoint /v2025/transforms response shape so the file
    // can be re-imported or diffed against the API directly.
    const payload = selected.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      internal: t.internal,
      attributes: t.attributes ?? {},
    }));
    downloadJson("transforms-export.json", payload);
  }

  function handleAddToGroup() {
    // Manual grouping is out of scope of the epic per #316. Stub with a
    // transient toast so the affordance is discoverable but expectations
    // are clear.
    showToast("Coming soon — manual grouping ships in a follow-up.");
  }

  return (
    <div
      // Sticky to the top of the scroll ancestor (the page scrolls, so
      // this pins to the viewport top). z-20 keeps it above the table
      // header (z-[5]) and any tooltip surfaces.
      className={cn(
        "sticky top-0 z-20",
        "relative flex items-center justify-between gap-3 rounded-md border border-foreground/15",
        "bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",
        "px-3 py-2 shadow-sm",
      )}
      role="region"
      aria-label="Bulk actions"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear selection"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <span className="font-medium shrink-0">
          {count} selected
        </span>
        <span
          className="truncate font-mono text-xs text-muted-foreground"
          title={selected.map((t) => t.name).join(", ")}
        >
          · {namePreview}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddToGroup}
          className="gap-1.5"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Add to group…
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Export JSON
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          disabled={deletableCount === 0}
          title={
            deletableCount === 0
              ? "Built-in transforms can't be deleted"
              : `Delete ${deletableCount} ${deletableCount === 1 ? "transform" : "transforms"}`
          }
          className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      {toast ? (
        <div
          // Anchored to the bar, slides under it. Auto-dismisses.
          // No portal — kept inside the bar so it scrolls with it
          // and disappears with the selection.
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-md"
        >
          {toast}
        </div>
      ) : null}

      <BulkDeleteDialog
        selected={selected}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onSuccess={onClear}
      />
    </div>
  );
}
