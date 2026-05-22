"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  PowerOff,
  RefreshCw,
  X,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  disableAccountsAction,
  recorrelateAccountsAction,
  refreshAccountsFromSourceAction,
  type BulkAccountsActionResult,
} from "./source-actions";

/**
 * Slim row shape the bulk bar needs from the parent table — keeps the
 * coupling explicit and avoids dragging the full `SourceAccountRow`
 * shape across components. The fields here are exactly what we read to
 * grey out actions that don't make sense for the current selection
 * (issue #260 acceptance: "Disable a bulk action if the selection
 * mixes states that don't make sense").
 */
export type AccountsBulkRow = {
  id: string;
  disabled: boolean;
  identityId: string | null;
};

type ActionKey = "recorrelate" | "disable" | "refresh";

type ActionConfig = {
  key: ActionKey;
  label: string;
  /** Pluralised noun used in dialog copy + success/failure strings. */
  pastTense: string;
  Icon: React.ComponentType<{ className?: string }>;
  /**
   * Returns null when the action is allowed on the current selection,
   * or a reason string for the disabled tooltip. The selection is
   * already guaranteed non-empty when this is invoked.
   */
  disabledReason: (rows: AccountsBulkRow[]) => string | null;
  /** Server action — wraps the matching factory. */
  invoke: (
    ids: string[],
    sourceId: string,
  ) => Promise<BulkAccountsActionResult>;
  /** Brief copy shown inside the confirmation dialog. */
  description: string;
};

const ACTIONS: ActionConfig[] = [
  {
    key: "recorrelate",
    label: "Re-correlate",
    pastTense: "submitted for re-correlation",
    Icon: Link2,
    disabledReason: (rows) =>
      rows.every((r) => r.identityId !== null)
        ? "All selected accounts are already correlated to an identity."
        : null,
    invoke: (ids, sourceId) => recorrelateAccountsAction(ids, sourceId),
    description:
      "Asks SailPoint to re-run correlation for the selected accounts. Useful to recover orphans after fixing correlation config.",
  },
  {
    key: "disable",
    label: "Disable",
    pastTense: "submitted for disable",
    Icon: PowerOff,
    disabledReason: (rows) =>
      rows.every((r) => r.disabled)
        ? "All selected accounts are already disabled."
        : null,
    invoke: (ids, sourceId) => disableAccountsAction(ids, sourceId),
    description:
      "Submits a disable task per account on the underlying source. May trigger downstream provisioning.",
  },
  {
    key: "refresh",
    label: "Refresh from source",
    pastTense: "submitted for refresh",
    Icon: RefreshCw,
    disabledReason: () => null,
    invoke: (ids, sourceId) =>
      refreshAccountsFromSourceAction(ids, sourceId),
    description:
      "Pulls the latest state for each selected account directly from the connector. One per-account aggregation per id.",
  },
];

/**
 * Bulk bar rendered above the accounts table when ≥1 row is selected.
 * Three actions — Re-correlate / Disable / Refresh from source — each
 * behind an `AlertDialog` confirm. Success/failure is surfaced inline
 * inside the dialog using the same pill pattern as
 * `aggregate-now-button.tsx` (no toast lib in the repo yet).
 *
 * Partial-success handling: the factory returns per-id outcomes in
 * `results[]`. The dialog summarises "{successCount} submitted,
 * {failures.length} failed" with a scrollable list of the failed ids
 * and their ISC error messages.
 *
 * Selection is cleared via `onCleared` after at least one id succeeds —
 * `router.refresh()` reloads the server-rendered table state.
 */
export function AccountsBulkBar({
  selected,
  sourceId,
  onCleared,
}: {
  selected: AccountsBulkRow[];
  sourceId: string;
  onCleared: () => void;
}) {
  const count = selected.length;
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground/15 bg-foreground/5 px-3 py-1.5">
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onCleared}
          aria-label="Clear selection"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <span className="font-medium">
          {count} {count === 1 ? "account" : "accounts"} selected
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {ACTIONS.map((action) => (
          <BulkActionButton
            key={action.key}
            action={action}
            selected={selected}
            sourceId={sourceId}
            onSuccess={onCleared}
          />
        ))}
      </div>
    </div>
  );
}

function BulkActionButton({
  action,
  selected,
  sourceId,
  onSuccess,
}: {
  action: ActionConfig;
  selected: AccountsBulkRow[];
  sourceId: string;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<{
    submitted: number;
    failures: Array<{ accountId: string; status: number; message: string }>;
    taskIds: Array<string | undefined>;
  } | null>(null);

  const disabledReason = action.disabledReason(selected);
  const disabled = disabledReason !== null;
  const count = selected.length;

  function handleOpenChange(next: boolean) {
    if (next) {
      setError(null);
      setSuccess(null);
    }
    setOpen(next);
  }

  function onConfirm() {
    setError(null);
    const ids = selected.map((r) => r.id);
    startTransition(async () => {
      const result = await action.invoke(ids, sourceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess({
        submitted: result.successCount,
        failures: result.failures,
        taskIds: result.taskIds,
      });
      // Refresh so the server-rendered accounts table re-reads from ISC
      // — disable + refresh in particular mutate observable state.
      router.refresh();
      if (result.successCount > 0) {
        // At least one id succeeded — clear the parent selection. The
        // dialog stays open so the user can see the per-id breakdown.
        onSuccess();
      }
    });
  }

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={disabled}
      aria-disabled={disabled}
    >
      <action.Icon className="h-3.5 w-3.5" />
      {action.label}
    </Button>
  );

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {disabled ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-block">
                {trigger}
              </span>
            </TooltipTrigger>
            <TooltipContent>{disabledReason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      )}

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action.label} {count} {count === 1 ? "account" : "accounts"}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed">
            {action.description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {success ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  {success.submitted}{" "}
                  {success.submitted === 1 ? "account" : "accounts"}{" "}
                  {action.pastTense}.
                </p>
                <TaskIdsList taskIds={success.taskIds} />
              </div>
            </div>
            {success.failures.length > 0 ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/30">
                <p className="flex items-center gap-1.5 pb-1 text-[11px] font-medium text-rose-900 dark:text-rose-200">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {success.failures.length}{" "}
                  {success.failures.length === 1 ? "account" : "accounts"}{" "}
                  failed
                </p>
                <ul className="max-h-40 overflow-y-auto space-y-0.5 font-mono text-[10px] text-rose-900 dark:text-rose-200">
                  {success.failures.map((f) => (
                    <li key={f.accountId} className="break-all">
                      <span className="font-medium">{f.accountId}</span>:{" "}
                      {f.status > 0 ? `${f.status} ` : ""}
                      {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 font-mono text-[11px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>{success ? "Close" : "Cancel"}</AlertDialogCancel>
          {!success && (
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (!pending) onConfirm();
              }}
            >
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {action.label} {count}{" "}
              {count === 1 ? "account" : "accounts"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Compact task-id rendering — shows up to 3 ids inline, then an "+N
 * more" tail to keep the dialog from ballooning on large batches. A
 * task id of `undefined` means ISC didn't return a descriptor for that
 * id (the request still fired); counted but not enumerated.
 */
function TaskIdsList({ taskIds }: { taskIds: Array<string | undefined> }) {
  const named = taskIds.filter((t): t is string => Boolean(t));
  const unnamed = taskIds.length - named.length;
  if (named.length === 0 && unnamed === 0) return null;
  const preview = named.slice(0, 3);
  const extra = named.length - preview.length;
  return (
    <p className="text-[11px] leading-snug">
      {preview.length > 0 ? (
        <>
          Task{preview.length === 1 ? " id" : " ids"}:{" "}
          <span className="font-mono">{preview.join(", ")}</span>
          {extra > 0 ? (
            <span className="text-emerald-900/70 dark:text-emerald-200/70">
              {" "}
              + {extra} more
            </span>
          ) : null}
          {unnamed > 0 ? (
            <span className="text-emerald-900/70 dark:text-emerald-200/70">
              {" "}
              ({unnamed} without a task id)
            </span>
          ) : null}
        </>
      ) : (
        <span className="text-emerald-900/70 dark:text-emerald-200/70">
          No task ids returned — check the tenant audit log to confirm.
        </span>
      )}
    </p>
  );
}
