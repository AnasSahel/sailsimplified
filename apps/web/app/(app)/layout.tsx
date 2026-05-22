import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "@/lib/auth";
import { sailpointCount } from "@/lib/sailpoint/client";
import { AppSidebar } from "./_components/app-sidebar";
import { Topbar } from "./_components/topbar";

async function fetchSidebarCounts(
  userId: string,
): Promise<Record<string, number | undefined>> {
  // All five run in parallel; any failure leaves that count undefined →
  // the corresponding badge is simply not rendered. 5s timeout per fetch
  // (enforced inside sailpointCount) caps the worst-case layout latency.
  const [sources, identities, transforms, accessRequests, certifications] =
    await Promise.all([
      sailpointCount(userId, "/v2025/sources"),
      sailpointCount(userId, "/v2025/public-identities"),
      sailpointCount(userId, "/v2025/transforms"),
      sailpointCount(userId, "/v2025/access-request-status"),
      sailpointCount(userId, "/v2025/campaigns"),
    ]);

  return {
    "/sailpoint/sources": sources,
    "/sailpoint/identities": identities,
    "/sailpoint/transforms": transforms,
    "/sailpoint/access-requests": accessRequests,
    "/sailpoint/certifications": certifications,
  };
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  const counts = await fetchSidebarCounts(session.user.id);

  return (
    <SidebarProvider>
      <AppSidebar
        name={session.user.name ?? null}
        email={session.user.email}
        counts={counts}
      />
      <SidebarInset>
        {/*
          Workspace-drawer slot. Pages can render a fixed-position drawer that
          should "push" the topbar + content to the left rather than overlay
          them. They expose a CSS variable on `:root` (e.g.
          `--workspace-drawer-width: 480px`) when their drawer is open, and
          this wrapper consumes it as `padding-right`. Routes that don't set
          the variable default to `0` → no effect, no surprise.
        */}
        <div
          className="flex flex-1 flex-col transition-[padding-right] duration-300 ease-out"
          style={{ paddingRight: "var(--workspace-drawer-width, 0px)" }}
        >
          <Topbar
            tenant={process.env.SAILPOINT_TENANT ?? null}
            name={session.user.name ?? null}
            email={session.user.email}
          />
          <div className="flex-1">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
