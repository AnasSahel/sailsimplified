import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * `<DetailShell>` — container for entity detail pages.
 * Same width as `<PageShell>` (`max-w-1400`). See DESIGN.md §2.2.
 *
 * Layout:
 *   - back link
 *   - header (composed via `<DetailHeader>`)
 *   - optional stats strip
 *   - optional tabs
 *   - body
 */
export function DetailShell({
  back,
  header,
  stats,
  tabs,
  children,
  className,
}: {
  back: { href: string; label: string };
  header: React.ReactNode;
  stats?: React.ReactNode;
  tabs?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full min-w-0 px-6 py-5",
        className,
      )}
    >
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
        <Link href={back.href}>
          <ArrowLeft />
          {back.label}
        </Link>
      </Button>
      {header}
      {stats ? <div className="pt-4">{stats}</div> : null}
      {tabs ? <div className="pt-4">{tabs}</div> : null}
      <div className="pt-4">{children}</div>
    </div>
  );
}

/**
 * `<DetailHeader>` — avatar + title + subtitle + badges (left) + actions
 * (right). Border-bottom for visual separation from stats/tabs/body.
 */
export function DetailHeader({
  avatar,
  title,
  subtitle,
  badges,
  actions,
}: {
  avatar?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-2 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="flex items-start gap-4 min-w-0">
        {avatar}
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="si-title">{title}</h1>
            {badges}
          </div>
          {subtitle && (
            <div className="si-body text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 md:shrink-0">{actions}</div>
      )}
    </div>
  );
}
