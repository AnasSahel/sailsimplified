"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Refresh button for the Activity tab. Triggers `router.refresh()` —
 * the server component re-fetches `listSourceActivity` on the next
 * render. Spinner state is purely visual; the server can't tell us when
 * the refresh actually lands so we time-box it.
 */
export function ActivityRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const onClick = React.useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      aria-label="Refresh activity"
    >
      <RefreshCw className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden />
      Refresh
    </Button>
  );
}
