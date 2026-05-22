"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Anchor,
  ChevronDown,
  Database,
  FileCode2,
  KeyRound,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { BrandMark, BrandWordmark } from "@/components/brand-mark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import { UserMenu } from "./user-menu";

type LeafItem = { href: string; label: string; icon: LucideIcon };
type FoldableItem = {
  label: string;
  icon: LucideIcon;
  children: LeafItem[];
};

const WORKSPACE: LeafItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const SAILPOINT: FoldableItem = {
  label: "SailPoint",
  icon: Anchor,
  children: [
    { href: "/sailpoint/sources", label: "Sources", icon: Database },
    { href: "/sailpoint/identities", label: "Identities", icon: Users },
    {
      href: "/sailpoint/identity-attributes",
      label: "Identity attributes",
      icon: Tags,
    },
    { href: "/sailpoint/transforms", label: "Transforms", icon: Wand2 },
    { href: "/sailpoint/rules", label: "Rules", icon: FileCode2 },
    { href: "/sailpoint/access-requests", label: "Access requests", icon: KeyRound },
    { href: "/sailpoint/certifications", label: "Certifications", icon: ShieldCheck },
  ],
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function CountBadge({
  count,
  active,
}: {
  count: number | string;
  active?: boolean;
}) {
  const display = typeof count === "number" ? formatCount(count) : count;
  return (
    <span
      className={`ml-auto shrink-0 pl-1 text-xs tabular-nums ${
        active ? "text-sidebar-foreground/80" : "text-sidebar-foreground/55"
      }`}
    >
      {display}
    </span>
  );
}

function userInitials(name: string | null, email: string) {
  const source = (name ?? email).trim();
  if (!source) return "·";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function AppSidebar({
  name,
  email,
  counts,
}: {
  name: string | null;
  email: string;
  counts?: Record<string, number | string | undefined>;
}) {
  const pathname = usePathname();
  const sailpointActive = SAILPOINT.children.some((c) =>
    isActive(pathname, c.href),
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-2">
        <div className="flex items-center justify-between gap-1 px-1 py-0.5">
          <Link
            href="/dashboard"
            className="flex items-center transition-opacity hover:opacity-80 group-data-[collapsible=icon]:hidden"
          >
            <BrandWordmark size="sm" />
          </Link>
          <Link
            href="/dashboard"
            className="hidden items-center transition-opacity hover:opacity-80 group-data-[collapsible=icon]:inline-flex"
          >
            <BrandMark size="sm" />
          </Link>
          <button
            type="button"
            aria-label="Settings"
            title="Settings (coming soon)"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="px-1 group-data-[collapsible=icon]:hidden">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              placeholder="Search…"
              aria-label="Search"
              className="h-8 w-full rounded-md border border-input bg-card pl-8 pr-10 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <kbd className="pointer-events-none absolute right-1.5 top-1/2 inline-flex h-[18px] -translate-y-1/2 select-none items-center rounded border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/45">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {WORKSPACE.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                const count = counts?.[item.href];
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <Icon />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        {count !== undefined && (
                          <CountBadge count={count} active={active} />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              <Collapsible
                asChild
                defaultOpen={true}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      tooltip={SAILPOINT.label}
                      isActive={sailpointActive}
                    >
                      <SAILPOINT.icon />
                      <span className="truncate">{SAILPOINT.label}</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90 text-sidebar-foreground/60 transition-transform duration-150 group-data-[state=open]/collapsible:rotate-0" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="gap-px">
                      {SAILPOINT.children.map((child) => {
                        const ChildIcon = child.icon;
                        const active = isActive(pathname, child.href);
                        const count = counts?.[child.href];
                        return (
                          <SidebarMenuSubItem key={child.href}>
                            <SidebarMenuSubButton asChild isActive={active}>
                              <Link href={child.href}>
                                <ChildIcon />
                                <span className="min-w-0 flex-1 truncate">
                                  {child.label}
                                </span>
                                {count !== undefined && (
                                  <CountBadge count={count} active={active} />
                                )}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {/*
        Footer hosts the user avatar + account menu on desktop (>= lg).
        Below lg the footer is hidden — at < md the Radix Sheet portal
        for the mobile sidebar can otherwise leak the footer's
        fixed-position content over the main canvas (issue #152), and at
        md..<lg the avatar collides with the collapsed icon rail. The
        avatar surface for those widths lives in the Topbar instead.
      */}
      <SidebarFooter className="hidden border-t lg:flex">
        <div className="flex items-center gap-2 px-1 py-0.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="bg-violet-100 text-[11px] font-medium text-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
              {userInitials(name, email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">
              {name ?? "Account"}
            </span>
            <span className="truncate text-xs text-sidebar-foreground/60">
              {email}
            </span>
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <UserMenu name={name} email={email} />
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
