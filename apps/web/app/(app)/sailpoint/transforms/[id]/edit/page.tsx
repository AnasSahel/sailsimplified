import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { sailpointFetch } from "@/lib/sailpoint/client";
import { listUserSamples } from "@/lib/transform-samples/queries";

import { TransformEditor } from "../../_components/transform-editor";

type FullTransform = {
  id: string;
  name: string;
  type: string;
  internal?: boolean;
  attributes?: Record<string, unknown>;
};
type TenantTransform = { id: string; name: string; type: string };
type TenantSource = { id: string; name: string };

export default async function EditTransformPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const { id } = await params;
  const userId = session.user.id;

  const [result, tenantTransformsResult, tenantSourcesResult, userSamples] =
    await Promise.all([
      sailpointFetch<FullTransform>(
        userId,
        `/v2025/transforms/${encodeURIComponent(id)}`,
      ),
      sailpointFetch<TenantTransform[]>(
        userId,
        "/v2025/transforms?limit=250",
        { signal: AbortSignal.timeout(8000) },
      ).catch(() => ({
        ok: false as const,
        error: { kind: "api_error" as const, status: 0, message: "" },
      })),
      sailpointFetch<TenantSource[]>(
        userId,
        "/v2025/sources?limit=250",
        { signal: AbortSignal.timeout(8000) },
      ).catch(() => ({
        ok: false as const,
        error: { kind: "api_error" as const, status: 0, message: "" },
      })),
      listUserSamples(userId, id).catch(() => []),
    ]);

  if (!result.ok) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        <Link
          href="/sailpoint/transforms"
          className="inline-flex h-7 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to transforms
        </Link>
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
          <p className="font-medium">Couldn't load transform</p>
          <p className="mt-1 font-mono text-xs">
            {result.error.kind === "api_error"
              ? `${result.error.status} ${result.error.message}`
              : result.error.kind}
          </p>
        </div>
      </div>
    );
  }

  // Built-in transforms ship with the SailPoint tenant and can't be modified.
  // The detail page hides the Edit action for built-ins, but the URL is still
  // technically reachable (bookmark, stale link, direct paste). Redirect to
  // the detail page with `?duplicate=1` so the Duplicate dialog auto-opens —
  // the user's most likely intent is "I want to fork this and edit my copy".
  if (result.data.internal) {
    redirect(
      `/sailpoint/transforms/${encodeURIComponent(id)}?duplicate=1`,
    );
  }

  const initialJson = JSON.stringify(
    {
      name: result.data.name,
      type: result.data.type,
      attributes: result.data.attributes ?? {},
    },
    null,
    2,
  );

  return (
    <TransformEditor
      mode={{ kind: "edit", id, originalName: result.data.name }}
      initialJson={initialJson}
      tenantTransforms={
        tenantTransformsResult.ok ? tenantTransformsResult.data : []
      }
      tenantSources={
        tenantSourcesResult.ok ? tenantSourcesResult.data : []
      }
      userSamples={userSamples}
    />
  );
}
