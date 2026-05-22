"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-card p-6 shadow-lg dark:shadow-[var(--si-shadow-4)] transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b dark:border-b-foreground/20 data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t dark:border-t-foreground/20 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r dark:border-r-foreground/20 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l dark:border-l-foreground/20 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps
  extends React.ComponentProps<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * Skip the default close (X) button at the top-right corner. Use when
   * the consumer renders its own close affordance (e.g. inside a custom
   * header) to avoid duplicate buttons.
   */
  hideClose?: boolean;
  /**
   * When `false`, skip the dark backdrop overlay and keep the underlying
   * page interactive — the sheet renders as a side panel coexisting with
   * the list/page behind it (Linear/Vercel/Notion workspace pattern).
   * Click outside the sheet does NOT close it; the consumer is expected
   * to provide explicit close affordances (X header, Esc, etc.).
   * Defaults to `true` to preserve modal behavior for existing callers.
   */
  modal?: boolean;
}

function SheetContent({
  side = "right",
  className,
  children,
  hideClose = false,
  modal = true,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      {modal && <SheetOverlay />}
      <SheetPrimitive.Content
        className={cn(sheetVariants({ side }), className)}
        onPointerDownOutside={
          modal
            ? onPointerDownOutside
            : (e) => {
                e.preventDefault();
                onPointerDownOutside?.(e);
              }
        }
        onInteractOutside={
          modal
            ? onInteractOutside
            : (e) => {
                e.preventDefault();
                onInteractOutside?.(e);
              }
        }
        {...props}
      >
        {children}
        {!hideClose && (
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-2 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
};
