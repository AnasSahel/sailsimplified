"use client";

import * as React from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * `<Drawer>` — wrapper on shadcn `<Sheet>` that bakes in the header
 * layout (title + titleBadge + meta line + actions + close button)
 * and the body scroll container.
 *
 * See DESIGN.md §2.6. Banned in `app/(app)/**`: raw `<Sheet>` in
 * product surfaces. Use this instead.
 */

const drawerContentVariants = cva(
  "flex w-full flex-col gap-0 p-0",
  {
    variants: {
      size: {
        md: "sm:max-w-xl",
        lg: "sm:max-w-2xl",
        xl: "sm:max-w-4xl",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type Size = NonNullable<VariantProps<typeof drawerContentVariants>["size"]>;

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "right" | "left";
  size?: Size;
  /** ARIA title — used for SheetTitle (visually hidden if no header). */
  title?: React.ReactNode;
  /** ARIA description (visually hidden). */
  description?: React.ReactNode;
  header?: React.ReactNode;
  tabs?: React.ReactNode;
  children: React.ReactNode;
  /**
   * When `false`, the drawer renders without a backdrop and the page
   * behind it stays interactive — click another row to swap content in
   * place, scroll/filter the list while consulting, etc. Only X / Esc
   * / programmatic close trigger dismiss. Default `true` keeps modal
   * behavior for existing callers (identities, sources, etc.).
   */
  modal?: boolean;
};

export function Drawer({
  open,
  onOpenChange,
  side = "right",
  size = "md",
  title,
  description,
  header,
  tabs,
  children,
  modal = true,
}: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
      <SheetContent
        side={side}
        hideClose
        modal={modal}
        className={cn(drawerContentVariants({ size }))}
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">{description}</SheetDescription>
        {header}
        {tabs ? <div className="px-5">{tabs}</div> : null}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export type DrawerMetaItem = {
  label: React.ReactNode;
  /** Renders the item in `text-foreground font-medium`. */
  emphasis?: boolean;
  /** Optional leading icon (kept small to match `.si-caption`). */
  icon?: React.ReactNode;
};

export function DrawerHeader({
  title,
  titleBadge,
  meta,
  actions,
  onClose,
  fullscreen,
  onFullscreenToggle,
}: {
  title: React.ReactNode;
  titleBadge?: React.ReactNode;
  meta?: DrawerMetaItem[];
  actions?: React.ReactNode;
  /**
   * When provided, the X button calls this handler directly instead of
   * relying on `SheetClose` (Radix Dialog context). Required for inline
   * drawers that don't live under a `Sheet` provider — e.g. the transforms
   * page's split-view panel.
   */
  onClose?: () => void;
  /** Current fullscreen state — controls the Maximize2/Minimize2 icon. */
  fullscreen?: boolean;
  /**
   * When provided, renders a fullscreen toggle button between the
   * caller's `actions` and the close X. Omit it for drawers that don't
   * support fullscreen (the default — identities/sources still use
   * fixed widths).
   */
  onFullscreenToggle?: () => void;
}) {
  return (
    <header className="flex flex-col gap-1.5 border-b px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="si-section truncate">{title}</span>
          {titleBadge}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {onFullscreenToggle && (
            <button
              type="button"
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen (F)"}
              onClick={onFullscreenToggle}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {fullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {onClose ? (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <SheetClose
              aria-label="Close"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </SheetClose>
          )}
        </div>
      </div>
      {meta && meta.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 si-caption text-muted-foreground">
          {meta.map((m, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span aria-hidden>·</span>}
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  m.emphasis && "font-medium text-foreground",
                )}
              >
                {m.icon}
                {m.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
    </header>
  );
}
