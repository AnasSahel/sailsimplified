"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

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
import { cn } from "@/lib/utils";

import { deleteRuleAction } from "./rule-editor-actions";

/**
 * Delete a connector rule (#353).
 *
 * Unlike transforms, ISC *rejects* the DELETE (409) while the rule is
 * attached to a source. So attachments are a hard block here, not just a
 * warning: the user must detach first (in the drawer's Attached-sources
 * panel) before this dialog lets them through. A name-retype guards
 * against wrong-row mistakes.
 */
export function DeleteRuleDialog({
  id,
  name,
  attachedCount,
  usagesAvailable,
  open,
  onOpenChange,
  onDeleted,
}: {
  id: string;
  name: string;
  /** Number of sources attaching this rule. */
  attachedCount: number | undefined;
  /** False when the attachment roll-up couldn't be computed. */
  usagesAvailable: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setConfirm("");
      setError(null);
    }
  }, [open]);

  const attached = usagesAvailable && (attachedCount ?? 0) > 0;
  const matched = confirm.trim() === name;
  const canDelete = !pending && !attached && matched;

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRuleAction(id, name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onDeleted();
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            Delete <span className="font-mono text-sm font-medium">{name}</span>?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-xs leading-relaxed">
            <span className="block">
              This permanently removes the connector rule from the connected
              SailPoint tenant.
            </span>
            {!usagesAvailable ? (
              <span className="block rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                Attachments couldn&apos;t be computed — SailPoint will reject
                the delete if the rule is still attached to a source.
              </span>
            ) : attached ? (
              <span className="block rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                <strong>Blocked:</strong> attached to {attachedCount} source
                {attachedCount === 1 ? "" : "s"}. Detach{" "}
                {attachedCount === 1 ? "it" : "them"} first — SailPoint refuses
                to delete an attached rule.
              </span>
            ) : (
              <span className="block rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
                Not attached to any source. Safe to delete.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!attached && (
          <div className="space-y-1">
            <label
              htmlFor="delete-rule-confirm"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Type <span className="font-mono text-foreground">{name}</span> to
              confirm
            </label>
            <input
              id="delete-rule-confirm"
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
              autoFocus
              className={cn(
                "h-9 w-full rounded-md border bg-card px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-1",
                matched
                  ? "border-input focus-visible:ring-ring"
                  : "border-rose-300 focus-visible:ring-rose-500",
              )}
              spellCheck={false}
            />
          </div>
        )}

        {error && (
          <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 font-mono text-[11px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canDelete}
            onClick={(e) => {
              e.preventDefault();
              if (canDelete) onConfirm();
            }}
            className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500 disabled:bg-rose-300 disabled:text-rose-50"
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Delete rule
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
