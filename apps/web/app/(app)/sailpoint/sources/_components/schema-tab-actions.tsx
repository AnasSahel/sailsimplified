"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SourceSchema } from "@/lib/sailpoint/sources-api";

import {
  refreshSchemasAction,
  resetSourceSchemaBaselineAction,
} from "./source-actions";

/**
 * Header actions for the Schemas tab (issue #266):
 *
 *  - **Export JSON** — serialises the active sub-tab's schema payload and
 *    triggers a Blob download. Filename: `source-<sourceId>-<schemaName>.json`.
 *    Pure client-side (no server round-trip needed) — the schema is already
 *    on the page from the parent's RSC fetch.
 *
 *  - **Refresh from source** — invokes `refreshSchemasAction`, which
 *    re-fetches `GET /v2025/sources/{id}/schemas` and calls
 *    `revalidatePath` to force the page to re-render with fresh schema
 *    data. Read-only — no aggregation is triggered, no provisioning is
 *    affected. Auxiliary `router.refresh()` mirrors the
 *    `drift-refresh-icon-button.tsx` belt-and-braces.
 *
 * Feedback model: matches the rest of the sources tab (no toast lib in
 * the repo yet — see `aggregate-now-button.tsx`). Inline success/error
 * pills render next to the buttons and self-clear after 4s on success.
 */
export function SchemaTabActions({
  sourceId,
  activeSchema,
}: {
  sourceId: string;
  activeSchema: SourceSchema;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);

  React.useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 4000);
    return () => window.clearTimeout(timer);
  }, [success]);

  function handleExport() {
    setError(null);
    setSuccess(null);
    try {
      const json = JSON.stringify(activeSchema, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `source-${sourceId}-${activeSchema.name.toLowerCase()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setSuccess(`Exported ${activeSchema.name} schema.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to export the schema as JSON.",
      );
    }
  }

  function handleRefresh() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await refreshSchemasAction(sourceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Force a re-render belt-and-braces with the action's own
      // `revalidatePath` — same pattern as `drift-refresh-icon-button.tsx`.
      router.refresh();
      const attrLabel =
        result.attributeCount === 1 ? "attr" : "attrs";
      setSuccess(`Schema refreshed (${result.attributeCount} ${attrLabel}).`);
    });
  }

  function handleResetBaseline() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await resetSourceSchemaBaselineAction(
        sourceId,
        activeSchema.name,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      const attrLabel =
        result.attributeCount === 1 ? "attr" : "attrs";
      setSuccess(
        `Baseline reset (${result.attributeCount} ${attrLabel}).`,
      );
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleExport}
        disabled={isPending}
      >
        <Download className="h-3.5 w-3.5" />
        Export JSON
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleRefresh}
        disabled={isPending}
        aria-label="Refresh schema from source"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Refresh from source
      </Button>

      {/* Overflow menu — destructive baseline reset (issue #265, D5). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="px-2"
            aria-label="More schema actions"
            disabled={isPending}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={(e) => {
              // Keep the menu close behaviour but defer the dialog open
              // until after the menu's own unmount transition — Radix's
              // focus-management throws otherwise.
              e.preventDefault();
              setResetOpen(true);
            }}
            className="text-rose-700 dark:text-rose-300"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset drift baseline
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset drift baseline?</AlertDialogTitle>
            <AlertDialogDescription>
              This wipes the current drift baseline for the{" "}
              <span className="font-mono">{activeSchema.name}</span>{" "}
              schema. Future drift will be measured from the
              freshly-fetched schema. Confirm?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleResetBaseline}
            >
              Reset baseline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {success ? (
        <span
          role="status"
          className="si-caption inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          {success}
        </span>
      ) : null}
      {error ? (
        <span
          role="alert"
          className="si-caption text-rose-700 dark:text-rose-300"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
