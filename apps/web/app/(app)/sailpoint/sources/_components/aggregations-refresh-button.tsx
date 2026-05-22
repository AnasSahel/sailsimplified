"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

import { refreshAggregationsAction } from "./aggregations-refresh-action";

/**
 * Refresh button for the Aggregations tab — calls `revalidatePath` on
 * the source detail page, then `router.refresh()` belt-and-braces so the
 * RSC re-renders even if the navigation cache is warm.
 */
export function AggregationsRefreshButton({
  sourceId,
}: {
  sourceId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handle() {
    setError(null);
    startTransition(async () => {
      const result = await refreshAggregationsAction(sourceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handle}
        disabled={isPending}
        aria-label="Refresh aggregations"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Refresh
      </Button>
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
