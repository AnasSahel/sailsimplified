import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Pill } from "@/components/ui/pill";
import { StateView } from "@/components/ui/state-view";
import { auth } from "@/lib/auth";
import { sailpointFetch } from "@/lib/sailpoint/client";
import { getIdentityAttributesReferencingTransform } from "@/lib/sailpoint/identity-attributes-api";
import { listUserSamples } from "@/lib/transform-samples/queries";
import {
  computeTransformUsageMap,
  type SourceWithPolicies,
} from "@simplified-identity/transforms";

import {
  DetailHeader,
  DetailShell,
} from "../../../_components/detail-shell";
import { JsonView } from "../../../_components/json-view";
import { TransformEditor } from "../_components/transform-editor";
import { TransformDetailActions } from "./_components/detail-actions";
import { UsedByIdentityAttributes } from "./_components/used-by-identity-attributes";

type FullTransform = {
  id: string;
  name: string;
  type: string;
  internal?: boolean;
  created?: string;
  modified?: string;
  attributes?: Record<string, unknown>;
};
type TenantTransform = { id: string; name: string; type: string };
type TenantSource = { id: string; name: string };

function MetadataItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="si-caption uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="si-body text-foreground">{children}</span>
    </div>
  );
}

function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TransformPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const userId = session.user.id;

  // Fetch the transform + supporting data concurrently.
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
        <div className="mt-8">
          <StateView
            intent={result.error.kind}
            title={
              result.error.kind === "not_connected"
                ? "Connect your SailPoint tenant"
                : result.error.kind === "auth_failed"
                  ? "SailPoint session expired"
                  : "SailPoint API error"
            }
            description={
              result.error.kind === "not_connected"
                ? "Sign in with SailPoint to load this transform."
                : result.error.kind === "auth_failed"
                  ? "Your access to SailPoint was revoked or has expired. Sign in again to continue."
                  : "The request failed. Try again, or contact your administrator if it persists."
            }
            detail={
              result.error.kind === "api_error"
                ? `${result.error.status} ${result.error.message}`
                : undefined
            }
          />
        </div>
      </div>
    );
  }

  const data = result.data;
  const tenantTransforms = tenantTransformsResult.ok
    ? tenantTransformsResult.data
    : [];
  const tenantSources = tenantSourcesResult.ok
    ? tenantSourcesResult.data
    : [];
  const tenantTransformNames = tenantTransforms.map((t) => t.name);

  // ── Usage map — best-effort (same timeout/soft-fail as list page) ──
  // Fetch identity profiles + sources-with-policies to build the usage map
  // for this transform. Failures degrade gracefully to "unavailable" state.
  const [profilesResult, sourcesWithPoliciesResult] = await Promise.all([
    sailpointFetch<unknown[]>(userId, "/v2025/identity-profiles", {
      signal: AbortSignal.timeout(8000),
    }).catch(() => ({
      ok: false as const,
      error: { kind: "api_error" as const, status: 0, message: "timeout" },
    })),
    tenantSourcesResult.ok
      ? Promise.all(
          tenantSourcesResult.data.map(async (s) => ({
            id: s.id,
            name: s.name,
            policies: await sailpointFetch<unknown[]>(
              userId,
              `/v2025/sources/${encodeURIComponent(s.id)}/provisioning-policies`,
              { signal: AbortSignal.timeout(6000) },
            )
              .then((r) => (r.ok ? r.data : []))
              .catch(() => [] as unknown[]),
          })),
        )
      : Promise.resolve([] as SourceWithPolicies[]),
  ]);

  const usagesAvailable =
    profilesResult.ok ||
    (Array.isArray(sourcesWithPoliciesResult) &&
      sourcesWithPoliciesResult.some((s) => s.policies.length > 0));

  const usagesByName = usagesAvailable
    ? computeTransformUsageMap(
        tenantTransforms,
        profilesResult.ok ? profilesResult.data : [],
        Array.isArray(sourcesWithPoliciesResult) ? sourcesWithPoliciesResult : [],
      )
    : new Map();

  const usages = usagesByName.get(data.name) ?? [];

  // ── Internal (built-in) transforms — read-only view ─────────────────
  // Built-in transforms cannot be edited via the ISC API. Show the detail
  // view with a Duplicate CTA (same pattern as the old detail page).
  if (data.internal) {
    const jsonString = JSON.stringify(data, null, 2);
    const usedByResult = await Promise.race([
      getIdentityAttributesReferencingTransform(userId, data.name),
      new Promise<{ ok: false; status: 0; message: string }>((resolve) =>
        setTimeout(
          () => resolve({ ok: false, status: 0, message: "timeout" }),
          8000,
        ),
      ),
    ]).catch(() => ({ ok: false, status: 0, message: "error" }) as const);

    return (
      <DetailShell
        back={{ href: "/sailpoint/transforms", label: "All transforms" }}
        header={
          <DetailHeader
            title={<span className="font-mono">{data.name}</span>}
            subtitle="SailPoint identity transform definition."
            badges={
              <Pill tone="accent" mono shape="square">
                {data.type}
              </Pill>
            }
            actions={
              <TransformDetailActions
                transform={{ id: data.id, name: data.name }}
                tenantTransformNames={tenantTransformNames}
                jsonString={jsonString}
              />
            }
          />
        }
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <MetadataItem label="Internal">
            <Pill tone="success" dot>
              Yes
            </Pill>
          </MetadataItem>
          {formatDate(data.created) && (
            <MetadataItem label="Created">
              <span className="text-muted-foreground">
                {formatDate(data.created)}
              </span>
            </MetadataItem>
          )}
          {formatDate(data.modified) && (
            <MetadataItem label="Modified">
              <span className="text-muted-foreground">
                {formatDate(data.modified)}
              </span>
            </MetadataItem>
          )}
          <MetadataItem label="ID">
            <code className="block break-all rounded bg-muted px-1.5 py-0.5 font-mono si-caption">
              {data.id}
            </code>
          </MetadataItem>
        </div>

        <div className="pt-6">
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="si-caption uppercase tracking-wide text-muted-foreground">
                Definition
              </span>
            </div>
            <JsonView data={data} />
          </div>
        </div>

        <div className="pt-6">
          <UsedByIdentityAttributes
            rows={usedByResult.ok ? usedByResult.data : []}
            available={usedByResult.ok}
          />
        </div>
      </DetailShell>
    );
  }

  // ── Custom transforms — editable on arrival ──────────────────────────
  const initialJson = JSON.stringify(
    {
      name: data.name,
      type: data.type,
      attributes: data.attributes ?? {},
    },
    null,
    2,
  );

  return (
    <TransformEditor
      mode={{
        kind: "edit",
        id,
        originalName: data.name,
        modified: data.modified ?? null,
      }}
      initialJson={initialJson}
      tenantTransforms={tenantTransforms}
      tenantSources={tenantSources}
      userSamples={userSamples}
      usages={usages}
      usagesAvailable={usagesAvailable}
    />
  );
}
