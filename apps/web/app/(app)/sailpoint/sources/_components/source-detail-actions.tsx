"use client";

import * as React from "react";
import { Loader2, MoreHorizontal, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { AggregateNowButton } from "./aggregate-now-button";
import { StubAction } from "./stub-action";

/**
 * Header actions toolbar for the source detail page.
 *
 * Two layouts driven by the 720px breakpoint mandated by issue #255:
 *  - `>= 720px`: the 3 actions render inline as outline buttons —
 *    `Aggregate now`, `Test connection`, `Edit`.
 *  - `< 720px`: collapse into a `⋯` overflow menu so the header stays
 *    compact and the title/badge row has breathing room.
 *
 * Both layouts share a single `AggregateNowButton` dialog instance via
 * its controlled `open` prop, so the confirm dialog state isn't
 * duplicated. On desktop the inline button renders its own trigger + the
 * dialog body. On mobile, the trigger is the overflow menu item; a
 * separate `hideTrigger` instance of `AggregateNowButton` mounts the
 * dialog body in a headless wrapper.
 *
 * Test connection / Edit are still stubbed (epic #182). In the inline
 * layout they're `<StubAction>` buttons that surface the "Coming in v2
 * (epic #182)" tooltip; in the overflow menu they render as disabled
 * `DropdownMenuItem`s with the same explanation inline as a secondary
 * line.
 */
export function SourceDetailActions({
  sourceId,
  sourceName,
  isAggregating,
}: {
  sourceId: string;
  sourceName: string;
  isAggregating: boolean;
}) {
  const [mobileAggregateOpen, setMobileAggregateOpen] = React.useState(false);

  return (
    <div className="flex items-center gap-2">
      {/* Desktop / >= 720px — inline buttons. */}
      <div className="hidden items-center gap-2 min-[720px]:flex">
        <AggregateNowButton
          id={sourceId}
          name={sourceName}
          isRunning={isAggregating}
        />
        <StubAction reason="Coming in v2 (epic #182)">Test connection</StubAction>
        <StubAction reason="Coming in v2 (epic #182)">Edit</StubAction>
      </div>

      {/* Mobile / < 720px — ⋯ overflow. */}
      <div className="flex items-center gap-2 min-[720px]:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Source actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {isAggregating ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      disabled
                      className="gap-2"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Aggregate now</span>
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    Already running — wait for current run to finish.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <DropdownMenuItem
                onSelect={(e) => {
                  // Prevent the menu from closing-before-state-flush, which
                  // can race with Radix focus management when an
                  // AlertDialog is the next surface to mount.
                  e.preventDefault();
                  setMobileAggregateOpen(true);
                }}
                className="gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Aggregate now</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled
              className="flex-col items-start gap-0.5"
              onSelect={(e) => e.preventDefault()}
            >
              <span>Test connection</span>
              <span className="text-[10px] text-muted-foreground">
                Coming in v2 (epic #182)
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled
              className="flex-col items-start gap-0.5"
              onSelect={(e) => e.preventDefault()}
            >
              <span>Edit</span>
              <span className="text-[10px] text-muted-foreground">
                Coming in v2 (epic #182)
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/*
         * Headless mount of the AggregateNow dialog so the mobile menu
         * item above can open it without duplicating the dialog body. On
         * desktop the visible `AggregateNowButton` already mounts its own
         * dialog; on mobile the desktop instance is `display:none` so it
         * never opens — only this instance does.
         */}
        <AggregateNowButton
          id={sourceId}
          name={sourceName}
          isRunning={isAggregating}
          open={mobileAggregateOpen}
          onOpenChange={setMobileAggregateOpen}
          hideTrigger
        />
      </div>
    </div>
  );
}
