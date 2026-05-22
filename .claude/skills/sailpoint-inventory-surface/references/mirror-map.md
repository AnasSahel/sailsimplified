# Mirror map: transforms → a new inventory surface

Concrete correspondence between the reference surface and what you write for a
new object `<thing>` (e.g. `rules`, `identity-profiles`, `roles`). Read the
transforms file in each row, then write the new one beside it.

## Worked read-only example

The **connector-rules** surface (epic #341, PR #349, commit `da3593e`) is the
cleanest read-only build. Its files are the best templates for a *read-only*
surface (transforms also carries authoring/editor/test machinery you usually
don't want in v0/v1):

- `packages/rules/src/` — `types.ts`, `catalog.ts`, `groups.ts`, `grouping.ts`,
  `usages.ts` (+ `usages.test.ts`), `lint/` (+ `lint.test.ts`).
- `packages/sailpoint-client/src/rules-api.ts`
- `apps/web/lib/sailpoint/rules-api.ts`
- `apps/web/app/(app)/sailpoint/rules/` — `page.tsx`, `_components/`.

## Package layer (`packages/<thing>/`)

| Reference (`packages/transforms/src/`) | New (`packages/<thing>/src/`) | Purpose |
|---|---|---|
| `types.ts` | `types.ts` | Domain `Record` type + the object's type/discriminator union. |
| `catalog.ts` | `catalog.ts` | Per-type label/description; `getXCatalogEntry` with a fallback so unknown ISC types still render. |
| `groups.ts` | `groups.ts` | Conceptual groups + `groupFor(type)` + `groupSlugFromParam`. |
| `grouping.ts` (`groupTransformsByType`) | `grouping.ts` (`groupXByType`) | Bucket rows by type; alphabetical, `"unknown"` last; intra-group order preserved. |
| `usages.ts` (`computeTransformUsageMap`) | `usages.ts` (`computeXUsages`) | **Pure walker** mapping object → where it's referenced. Define the `*Like` minimal input + the `UsageEntry` shape. |
| `lint/{types,engine,rules/}.ts` | same | Pure per-item detector registry + engine. Add detectors as one file each. |
| `index.ts` | `index.ts` | Barrel: `export * from` each module. |
| `package.json`, `tsconfig.json` | same | Copy verbatim, change `name` to `@simplified-identity/<thing>`. The `test` script is `node --experimental-strip-types --test src/**/*.test.ts`. `tsconfig` extends `../../tsconfig.base.json` with `allowImportingTsExtensions: true`. |

Packages ship **TS source** (no build step) — Turbopack transpiles. After
creating the package, add `"@simplified-identity/<thing>": "workspace:*"` to
`apps/web/package.json` deps and run `pnpm install`.

## HTTP layer (`packages/sailpoint-client/src/<thing>-api.ts`)

Mirror `transforms-api.ts`: declare a local `ConnectorRule`-style DTO (do NOT
import the package type), `listX(opts)` / `getX(opts, id)` returning a
discriminated `FetchResult<T>`, and a local `mapError(SailpointFetchError)`.
Export the functions + DTO types from `packages/sailpoint-client/src/index.ts`.
ISC reads go through `sailpointFetch(opts, path)`.

## Shim (`apps/web/lib/sailpoint/<thing>-api.ts`)

Server-only token-resolution wrapper — mirror `transforms-api.ts`:

```ts
import "server-only";
import { listX as pureList, getX as pureGet } from "@simplified-identity/sailpoint-client";
import { getClientOptsForUser } from "./client";

export type { /* DTO types */ } from "@simplified-identity/sailpoint-client";

const NOT_CONNECTED = { ok: false as const, status: 0, message: "Not connected to SailPoint. Sign in again or check the tenant configuration." };

export async function listX(userId: string) {
  const opts = await getClientOptsForUser(userId);
  if (!opts) return NOT_CONNECTED;
  return pureList(opts);
}
```

Note: the page may also call `sailpointFetch<T>(userId, path, init?)` directly
(it resolves the token internally from `userId`) for ad-hoc fan-out fetches —
that's what the transforms/rules pages do for the secondary inputs the usages
walker needs (identity-profiles, sources, source detail, etc.).

## Web UI (`apps/web/app/(app)/sailpoint/<thing>/`)

| Reference (transforms `_components/` + `page.tsx`) | New | Notes |
|---|---|---|
| `page.tsx` | `page.tsx` | Server component: auth → parse `searchParams` → fetch object + secondary inputs (`Promise.all`, best-effort with `AbortSignal.timeout`) → `computeXUsages` → enrich rows with usage count → filter/search → KPIs → render. Map `!result.ok` to `<StateView intent={result.error.kind} …>`. |
| `transforms-kpi-strip.tsx` | `<thing>-kpi-strip.tsx` | `<StatCell layout="inline">` row; a card hrefs to a narrowing filter. |
| `transforms-table.tsx` | `<thing>-table.tsx` | Grouped `<tbody>` per type, sticky `GroupHeaderRow`, `?groups.<type>=closed`. Strip selection/bulk/row-actions for read-only. |
| `usages-cell.tsx` | `attached-sources-cell.tsx` (or `<x>-cell.tsx`) | `"use client"`; `<Pill tone dot mono>` link to `?selected=<id>` + tooltip. |
| `transform-drawer.tsx` (lean read-only subset) | `<thing>-drawer.tsx` | Fixed `<aside className="fixed right-0 top-0 h-screen …">`, publishes `--workspace-drawer-width` in a `useEffect` (clear on close + unmount cleanup), Esc closes, consolidated scroll. **Don't** copy the 1200-line transforms drawer wholesale — it carries tabs/test/editor; build the lean panel. |
| `json-panel.tsx` | `<thing>-code-panel.tsx` (only if showing code) | Dark `<pre>` + Copy button. For non-JSON, write an escape-safe regex highlighter. |
| `type-filter.tsx` | `<thing>-type-filter.tsx` | `<FilterDropdown>` over the available types, builds `?type=` hrefs. |
| n/a | `types.ts` | `XRow = XDTO & { usageCount: number | undefined }`. |

Shared primitives (import, don't recreate): `@/components/ui/{pill,stat-group,
filter-bar,filter-dropdown,state-view,table,tooltip,pagination}`,
`@/app/(app)/_components/{page-shell,type-pill}`.

### Sidebar entry

`apps/web/app/(app)/_components/app-sidebar.tsx` → add a `LeafItem` to the
`SAILPOINT.children` array after the relevant sibling, with a lucide icon (e.g.
`{ href: "/sailpoint/<thing>", label: "<Things>", icon: SomeIcon }`). Import
the icon at the top.

### Layout contract

`apps/web/app/(app)/layout.tsx` already consumes
`var(--workspace-drawer-width, 0px)` as `padding-right`. Your drawer only needs
to set/clear the variable — no layout change required.

## Worktree UI-smoke setup

The dev server is on **:3200**. From a worktree, symlink the gitignored env +
DB from the main checkout so you reuse the OAuth session + data:

```sh
MAIN=/Users/anas/brain/projects/products/simplified-identity
ln -s "$MAIN/apps/web/.env.local" apps/web/.env.local
mkdir -p apps/web/data
ln -s "$MAIN/apps/web/data/simplified-identity.sqlite" apps/web/data/simplified-identity.sqlite
```

Then run `pnpm dev` from `apps/web` (or stop the main server first if :3200 is
taken — `lsof -ti tcp:3200 | xargs kill`). Drive the page with the browser
tools; the `localhost` session cookie is shared, so an authenticated render
works. A cookieless `curl` returns 307 (auth redirect) — that only confirms the
route compiled.

## Ship checklist

1. `pnpm --filter @simplified-identity/<thing> typecheck` + package tests green.
2. `pnpm --filter web typecheck` + `pnpm --filter web lint` (no NEW errors).
3. UI smoke on :3200 against the real tenant.
4. PR with a `## Decisions` section for any non-obvious mid-build calls.
5. On merge: confirm every sub-issue actually closed (the comma-listed `Closes`
   only closes the first — close the rest manually). Comment + close the epic.
   Keep all issue/PR text free of client/tenant names (public product repo).
