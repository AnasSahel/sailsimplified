"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";

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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AggregationType } from "@/lib/sailpoint/sources-api";

import { triggerAggregationAction } from "./source-actions";

/**
 * "Aggregate now" trigger. Wraps the SailPoint
 * `POST /v2025/sources/{id}/load-accounts` and `/load-entitlements`
 * endpoints behind an explicit confirm step — kicking off an aggregation
 * spins external connectors and can rewire downstream provisioning, so
 * the one-click path is intentional.
 *
 * Pattern mirrors `process-button.tsx` (PR #104): inline success/error
 * states inside the dialog + `router.refresh()` to pull the updated
 * source `status` / `since`. No toaster lib in the repo yet — adding one
 * is its own ADR.
 *
 * Selection: two checkboxes (accounts, entitlements). Default is
 * `accounts` only because that's the common admin gesture; user can
 * tick `entitlements` (or both) before confirming.
 *
 * Disabled state: when `isRunning` is true the trigger button is
 * `aria-disabled` and the tooltip explains why. We wrap the underlying
 * `<button>` in a focusable `<span>` so the tooltip target stays
 * hoverable even when the button is non-interactive — see
 * `overview-action-stub.tsx` for the same pattern.
 */
export function AggregateNowButton({
  id,
  name,
  isRunning,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  id: string;
  name: string;
  isRunning: boolean;
  /**
   * Optional controlled open state. When provided, the dialog visibility
   * is driven by the parent (used by `<SourceDetailActions>` to share the
   * same dialog instance between the desktop inline button and the mobile
   * `⋯` overflow menu item).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Hide the default inline trigger button. Useful when the parent owns
   * the trigger (e.g. a DropdownMenuItem in the mobile overflow menu) and
   * just wants this component to provide the dialog body + behaviour.
   */
  hideTrigger?: boolean;
}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      if (controlledOpen === undefined) setUncontrolledOpen(next);
    },
    [controlledOpen, onOpenChange],
  );
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<
    Array<{ type: AggregationType; taskId?: string }> | null
  >(null);
  const [accounts, setAccounts] = React.useState(true);
  const [entitlements, setEntitlements] = React.useState(false);

  // Reset transient state on open. Handled inline in `onOpenChange` rather
  // than via `useEffect`, both to keep the reset synchronous with the user
  // action and to avoid the `react-hooks/set-state-in-effect` rule.
  function handleOpenChange(next: boolean) {
    if (next) {
      setError(null);
      setSuccess(null);
      setAccounts(true);
      setEntitlements(false);
    }
    setOpen(next);
  }

  const selectedTypes: AggregationType[] = [
    ...(accounts ? (["accounts"] as const) : []),
    ...(entitlements ? (["entitlements"] as const) : []),
  ];
  const hasSelection = selectedTypes.length > 0;

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await triggerAggregationAction(id, selectedTypes);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result.triggered);
      router.refresh();
    });
  }

  if (isRunning) {
    // No dialog needed in the running state — the button is purely
    // informational. When `hideTrigger` is set, render nothing so the
    // parent (mobile overflow menu) can render its own disabled item.
    if (hideTrigger) return null;
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-block">
              <Button
                variant="outline"
                size="sm"
                disabled
                aria-disabled
                className="gap-1.5"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Aggregate now
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            An aggregation is already running on this source. Wait for it
            to finish before triggering another.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {hideTrigger ? null : (
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Aggregate now
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Run aggregation on this source?</AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed">
            Pulls fresh data from{" "}
            <span className="font-mono text-foreground">{name}</span> into
            the connected SailPoint tenant. The connector spins immediately;
            depending on the source size, downstream identity processing
            may follow once aggregation completes.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!success && (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              What to aggregate
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={accounts}
                onChange={setAccounts}
                disabled={pending}
              />
              <span>
                <span className="font-medium">Accounts</span>
                <span className="ml-1.5 text-muted-foreground">
                  — pulls users/groups from the source
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={entitlements}
                onChange={setEntitlements}
                disabled={pending}
              />
              <span>
                <span className="font-medium">Entitlements</span>
                <span className="ml-1.5 text-muted-foreground">
                  — pulls permission objects (group membership, roles)
                </span>
              </span>
            </label>
          </div>
        )}

        {success ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Submitted to SailPoint.</p>
              <ul className="space-y-0.5">
                {success.map((t) => (
                  <li key={t.type} className="text-[11px]">
                    <span className="capitalize">{t.type}</span>
                    {t.taskId ? (
                      <span className="ml-1 font-mono">— task {t.taskId}</span>
                    ) : (
                      <span className="ml-1 text-muted-foreground">
                        — no task id returned (check tenant audit log)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
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
              disabled={pending || !hasSelection}
              onClick={(e) => {
                e.preventDefault();
                if (!pending && hasSelection) onConfirm();
              }}
            >
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Aggregate now
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
