import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * `<FilterBar>` — container for a search box + filter dropdowns +
 * "Clear filters" affordance. See DESIGN.md §2.9.
 *
 * Two clear modes:
 *  - `clearHref`: URL-driven (default for list pages with URL-backed
 *    filters); renders a `<Link>` ghost button.
 *  - `onClear`: client-state callback (for ephemeral, client-side
 *    filters that don't touch the URL); renders a plain button. Pass
 *    `undefined` to hide.
 *
 * Pass exactly one of `clearHref` / `onClear`.
 */
export function FilterBar({
  search,
  filters,
  clearHref,
  onClear,
  trailing,
  className,
}: {
  search?: React.ReactNode;
  filters: React.ReactNode;
  /** When provided, renders a "Clear filters" ghost link. */
  clearHref?: string;
  /** When provided, renders a "Clear filters" ghost button calling this. */
  onClear?: () => void;
  /** Right-aligned slot (e.g. layout toggle, view density). */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {search}
      {filters}
      {clearHref && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={clearHref}>Clear filters</Link>
        </Button>
      )}
      {!clearHref && onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}
