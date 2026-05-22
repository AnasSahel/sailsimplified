"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, Loader2 } from "lucide-react";

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

import { findAvailableCopyName } from "./copy-name";
import { duplicateRuleAction } from "./rule-editor-actions";

/**
 * Duplicate a connector rule (#353). The copy carries the original's type,
 * sourceCode, signature and attributes — only the name changes. The input
 * pre-fills the client-computed `(copy)` default; the server re-checks
 * uniqueness against the live tenant list on submit.
 */
export function DuplicateRuleDialog({
  rule,
  tenantRuleNames,
  open,
  onOpenChange,
  onDuplicated,
}: {
  rule: { id: string; name: string };
  tenantRuleNames: ReadonlyArray<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDuplicated: (id: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const taken = new Set(tenantRuleNames);
    const fallback = `${rule.name} (copy)`;
    setName(findAvailableCopyName(rule.name, taken) ?? fallback);
    setError(null);
  }, [open, rule.name, tenantRuleNames]);

  const trimmed = name.trim();
  const canSubmit = !pending && trimmed !== "";

  function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await duplicateRuleAction(rule.id, trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onDuplicated(result.id);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CopyPlus className="h-4 w-4 text-foreground" />
            Duplicate{" "}
            <span className="font-mono text-sm font-medium">{rule.name}</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed">
            Creates a copy with the same type and source code. Choose a unique
            name — the copy starts unattached to any source.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1">
          <label
            htmlFor="duplicate-rule-name"
            className="text-[11px] font-medium text-muted-foreground"
          >
            New name
          </label>
          <input
            id="duplicate-rule-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault();
                onSubmit();
              }
            }}
            autoFocus
            className={cn(
              "h-9 w-full rounded-md border bg-card px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-1",
              trimmed === ""
                ? "border-rose-300 focus-visible:ring-rose-500"
                : "border-input focus-visible:ring-ring",
            )}
            spellCheck={false}
          />
        </div>

        {error && (
          <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 font-mono text-[11px] text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSubmit}
            onClick={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Duplicate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
