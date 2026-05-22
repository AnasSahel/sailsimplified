"use client";

import { ChevronDown, Filter } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { ACCOUNT_MANAGER_OPTIONS } from "./accounts-filters-shared";

/**
 * Single-select "Manager assigned" filter for the Accounts tab.
 *
 * URL contract: `?accmgr=yes|no`. The server-side page maps to
 * `filters=attributes.managerId pr` (presence) and not-pr respectively.
 *
 * When the source's account schema doesn't declare a `managerId`
 * attribute, the filter renders as a disabled trigger with a tooltip
 * explaining why — per-connector availability is the rule, not the
 * exception (only HR-grade authoritative sources typically expose it).
 */
export function AccountsManagerFilter({
  selected,
  available,
}: {
  selected: string | null;
  /**
   * `true` when the source's account schema declares a `managerId`
   * attribute (or close variant). `false` disables the trigger.
   */
  available: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!available) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5 cursor-not-allowed opacity-50",
              )}
              aria-disabled
              role="button"
              tabIndex={0}
            >
              <Filter className="h-3.5 w-3.5" />
              Manager assigned
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            This source&apos;s schema doesn&apos;t expose a managerId
            attribute.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <FilterDropdown
      label="Manager assigned"
      value={selected}
      options={
        ACCOUNT_MANAGER_OPTIONS as unknown as { value: string; label: string }[]
      }
      clearLabel="Any"
      hrefFor={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("accpage");
        if (value) params.set("accmgr", value);
        else params.delete("accmgr");
        const qs = params.toString();
        return qs ? `${pathname}?${qs}` : pathname;
      }}
    />
  );
}
