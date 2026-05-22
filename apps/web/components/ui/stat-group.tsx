import Link from "next/link";

import { StatHelpTooltip } from "@/components/ui/stat-help-tooltip";
import { cn } from "@/lib/utils";

/**
 * `<StatGroup>` — KPI cards (grid layout) or detail-header stats
 * (inline layout). See DESIGN.md §2.8.
 *
 * `grid` is used at page-level above filters / table.
 * `inline` is used in detail pages next to the header.
 *
 * Tones (`grid` only): `warning` (amber) / `danger` (rose) re-tint the
 * card border and background slightly. Inline layout doesn't accept
 * tones — semantics carried by the value, not the background.
 */

export type StatItem = {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /**
   * Optional second sub-line rendered below `sub` at the same muted style.
   * Useful when a card carries a static descriptor on `sub` (e.g. tier
   * breakdown) and a dynamic state line on `secondarySubline` (e.g.
   * "Snapshot from 7s ago"). Both render at the same typographic weight;
   * compose them in `sub` directly if you want different sizes.
   */
  secondarySubline?: React.ReactNode;
  href?: string;
  /** Grid-only. Ignored in `inline`. */
  tone?: "default" | "warning" | "danger";
  /** Leading icon rendered at the top-right of the cell. */
  icon?: React.ReactNode;
  /**
   * Optional interactive control rendered top-right of the title row,
   * in the same slot as `icon`. When both are set, `headerAction` wins —
   * it's the load-bearing element (a button vs a decorative icon).
   * Use for per-card refresh affordances, dropdowns, etc. Kept minimal
   * on purpose: complex headers should live outside the primitive.
   */
  headerAction?: React.ReactNode;
  /**
   * Optional help text. When set, a small `?` icon renders inline with the
   * label, opening a tooltip with this string on hover or keyboard focus.
   * Keep it short — wraps at ~280px max width.
   * Expects a plain `string` for the `aria-label` of the trigger; use the
   * label as the trigger's accessible name (`What is <label>?`).
   */
  tooltip?: string;
};

export function StatGroup({
  layout,
  items,
  className,
}: {
  layout: "grid" | "inline";
  items: StatItem[];
  className?: string;
}) {
  if (layout === "inline") {
    // Below `sm`, the inline strip would cram 4 cells into ~95px columns and
    // wrap sub-text to 3+ lines. Auto-collapse to a 2-col grid (1-col for
    // very narrow viewports). At `sm` and up, restore the dense inline strip
    // (single rounded card with vertical dividers).
    return (
      <div
        className={cn(
          "grid grid-cols-1 gap-3 min-[400px]:grid-cols-2",
          "sm:flex sm:gap-0 sm:rounded-lg sm:border sm:bg-card sm:divide-x",
          className,
        )}
      >
        {items.map((item, idx) => (
          <StatCell key={idx} item={item} layout="inline" />
        ))}
      </div>
    );
  }
  // grid
  const cols = items.length;
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2",
        cols >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        className,
      )}
    >
      {items.map((item, idx) => (
        <StatCell key={idx} item={item} layout="grid" />
      ))}
    </div>
  );
}

/**
 * Single-cell renderer split out so callers that want to mix server-
 * rendered server cells with a client-rendered island in the same row
 * (e.g. the Transforms KPI strip with its lint-fed Issues card, #310)
 * can render the same chrome without going through `<StatGroup>`. The
 * strip wrapper (`sm:divide-x`, etc.) lives at the call site in that
 * case so all cells share the same parent for divider alignment.
 */
export function StatCell({
  item,
  layout,
}: {
  item: StatItem;
  layout: "grid" | "inline";
}) {
  const tone = layout === "grid" ? (item.tone ?? "default") : "default";

  // When the cell carries a `headerAction` (an interactive control like a
  // refresh button), wrapping the whole card in a `<Link>` would nest a
  // `<button>` inside an `<a>` — invalid HTML. We switch to a "link
  // overlay" mode: the card stays a `<div>`, and the link is an
  // absolutely-positioned `<span>` that covers the card area below the
  // title row. The headerAction sits above the overlay via `z-10`.
  const useLinkOverlay = Boolean(item.href && item.headerAction);
  const useFullLinkWrap = Boolean(item.href && !item.headerAction);

  const titleRow = (
    <div className="relative z-10 flex items-center justify-between gap-2">
      <span className="si-caption inline-flex items-center gap-1 uppercase tracking-wider text-muted-foreground">
        {item.label}
        {item.tooltip && typeof item.label === "string" ? (
          <StatHelpTooltip label={item.label} text={item.tooltip} />
        ) : null}
      </span>
      {item.headerAction ? (
        // `headerAction` is a real control — `z-10` keeps it clickable
        // when a sibling overlay link covers the card body.
        <span className="inline-flex items-center">{item.headerAction}</span>
      ) : item.icon ? (
        <span
          aria-hidden
          className={cn(
            "text-muted-foreground/60",
            tone === "warning" && "text-amber-600 dark:text-amber-400",
            tone === "danger" && "text-rose-600 dark:text-rose-400",
          )}
        >
          {item.icon}
        </span>
      ) : null}
    </div>
  );

  const valueAndSub = (
    <>
      <div className="text-3xl font-semibold leading-tight tracking-tight tabular-nums">
        {item.value}
      </div>
      {item.sub ? (
        <div className="si-caption text-muted-foreground">{item.sub}</div>
      ) : !item.secondarySubline ? (
        <div className="h-4" aria-hidden />
      ) : null}
      {item.secondarySubline ? (
        <div className="si-caption text-muted-foreground/80">
          {item.secondarySubline}
        </div>
      ) : null}
    </>
  );

  const body = (
    <div
      className={cn(
        // `min-w-0` lets each grid cell shrink below its natural
        // content width when the row would otherwise overflow the
        // page. Without it, `grid-cols-4` cells default to
        // `minmax(auto, 1fr)` and a long label like "Orphan accounts"
        // forces the whole strip past the viewport edge on narrower
        // screens (caught at ~1366px).
        layout === "grid"
          ? "flex h-full min-w-0 flex-col gap-1 rounded-lg border bg-card p-4 transition-colors"
          : // Inline: below `sm`, cell is a self-contained card (rounded
            // border + bg + padding). At `sm:` the parent supplies the
            // border + dividers, so we drop the per-cell card chrome and
            // grow to fill the row. `min-w-0` lets the flex-1 cells
            // shrink below their natural content width — without it the
            // row overflows horizontally when the natural sum of widths
            // exceeds the viewport (caught with 5 cells + long labels).
            "flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-4 sm:flex-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-5 sm:py-4",
        layout === "grid" &&
          tone === "warning" &&
          "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20",
        layout === "grid" &&
          tone === "danger" &&
          "border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20",
        layout === "grid" &&
          item.href &&
          "hover:border-foreground/30",
        layout === "inline" &&
          item.href &&
          "hover:border-foreground/30 sm:hover:border-transparent sm:hover:bg-muted/40",
        useLinkOverlay && "relative",
      )}
    >
      {titleRow}
      {useLinkOverlay ? (
        // Anchor with `absolute inset-0` covers the entire card so the
        // value + sub area is clickable. The headerAction sits on
        // `z-10` (titleRow) so it stays above the overlay and can be
        // clicked independently. The link is transparent — visible
        // content (value, sub) still renders behind it; only its
        // pointer events matter here.
        <Link
          href={item.href!}
          aria-label={
            typeof item.label === "string" ? `View ${item.label}` : undefined
          }
          className={cn(
            "absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            // Match the card's corner radius for the focus ring.
            // Inline cells lose their rounded chrome at `sm:`+, so the
            // focus ring follows.
            "rounded-lg",
            layout === "inline" && "sm:rounded-none",
          )}
        />
      ) : null}
      {valueAndSub}
    </div>
  );

  if (!useFullLinkWrap) return body;
  return (
    <Link
      href={item.href!}
      className={cn(
        "block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        layout === "grid" && "rounded-lg",
        // Inline cells share the row via `flex-1` on their inner body at
        // `sm:`+. Below `sm` the parent is a grid, so the wrapper must
        // stay a plain block; from `sm:` it grows in the flex row.
        layout === "inline" && "rounded-lg sm:flex sm:min-w-0 sm:flex-1 sm:rounded-none",
      )}
    >
      {body}
    </Link>
  );
}
