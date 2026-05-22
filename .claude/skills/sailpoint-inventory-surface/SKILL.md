---
name: sailpoint-inventory-surface
description: >-
  Recipe for building a new read-only "object inventory" admin surface in the
  Simplified Identity repo by mirroring the existing transforms surface. Use
  this whenever you're adding a new SailPoint object browser/list/inventory
  page — connector rules, identity profiles, roles, access profiles,
  entitlements, governance objects, etc. — or implementing one of the "[X] v0
  admin browser" epics (e.g. identity-profiles #214, roles #217). Trigger it
  for any task that means "stand up a /sailpoint/<thing> list page with a KPI
  strip, grouped table, usages/attachment column, and a detail drawer", "add a
  pure packages/<thing> + a <thing>-api to sailpoint-client", or "mirror the
  transforms surface for <new object>". Covers the monorepo boundaries, the web
  UI pattern, the pure analysis package, and the ship workflow (shape-gate,
  tests, UI smoke, PR, issue closure). Don't hand-roll a new surface from
  scratch — this encodes the conventions the transforms/identities/sources
  surfaces already settled.
---

# Building a SailPoint inventory surface (mirror the transforms pattern)

This repo (`AnasSahel/simplified-identity`) ships admin surfaces for SailPoint
ISC objects. Every list/inventory surface follows the **same three-layer
shape**, first settled by the **transforms** surface and reused by sources,
identities, identity-attributes, and connector-rules. When you add a new object
browser, **mirror that shape** rather than inventing one — the conventions
below are load-bearing for consistency and were paid for in earlier pixel/arch
reviews.

The connector-rules v1 surface (epic #341, PR #349) is the most recent and
cleanest read-only example — when in doubt, read it alongside transforms.

## The three layers (and the hard boundary between them)

```
packages/<thing>/                  # PURE: types, taxonomy, grouping, usages walker, lint.
                                   # No DB, no HTTP, no React. Never imports another package.
packages/sailpoint-client/
  src/<thing>-api.ts               # PURE HTTP only: list/get against ISC /vXXXX/<endpoint>.
apps/web/
  lib/sailpoint/<thing>-api.ts     # Server-only shim: resolves DB-backed token, wraps the pure client.
  app/(app)/sailpoint/<thing>/     # The UI: page.tsx (server) + _components/ (client).
```

**The boundary rule is non-negotiable** (it's in the repo `CLAUDE.md`, learned
the hard way in an earlier "PR-4 boundary refinement"):

- **Packages never import each other.** If `sailpoint-client`'s `<thing>-api`
  wants the domain `Record` type owned by `packages/<thing>`, do **not** import
  it — declare a structurally-identical HTTP DTO locally instead (exactly how
  `transforms-api.ts` declares its own `TransformRecord` while
  `packages/transforms` owns `EvaluableTransform`). The web layer treats the
  DTO as the domain type (structurally assignable). This keeps the build graph
  acyclic and the packages independently testable.
- **All analysis is pure and lives in `packages/<thing>`.** The usages walker,
  lint, grouping, catalog — pure functions over injected data. The web layer
  fetches inputs and calls them; it never embeds analysis logic.
- **The shim is the only place DB + HTTP meet.** `getClientOptsForUser(userId)`
  resolves the token; the pure client takes `SailpointClientOptions`.

See `references/mirror-map.md` for the exact file-by-file correspondence and
the token-resolution snippet.

## Build order (data wedge → list → drawer → lint)

Mirror the transforms sequencing — each step is independently testable:

1. **Data + package wedge.** Write `packages/<thing>` (`types.ts`,
   `catalog.ts`, `groups.ts`, `grouping.ts`, `usages.ts`, `lint/`) + the pure
   `<thing>-api.ts` in `sailpoint-client`. The usages walker is unit-tested
   with fixture inputs — **no live tenant**. Add the workspace dep
   (`"@simplified-identity/<thing>": "workspace:*"`) to `apps/web/package.json`
   and run `pnpm install` to link it.
2. **List page.** `/sailpoint/<thing>/page.tsx` (server component) + KPI strip
   → grouped table → usages/attachment cell. Add the sidebar entry.
3. **Drawer.** Read-only detail panel consuming the same usages map.
4. **Lint.** Surface the detectors (KPI count, row signal, drawer/list banner).

## Web UI conventions (don't reinvent these)

Read the transforms components and adapt; the primitives are shared:

- **`<PageShell title description>`** — page chrome. Full-width, no `max-w`.
- **KPI strip** — a row of `<StatCell item layout="inline">` inside
  `grid grid-cols-1 ... sm:flex sm:divide-x`. Counts reflect the **post-filter
  visible set**. A card links to a narrowing filter (e.g. an "Unattached" card
  → `?attached=0`). Degrade to "—" when a roll-up couldn't be computed.
- **Grouped table** — `<Table>` with one `<tbody>` per group; group rows are
  `sticky top-0 z-[5]` with a chevron toggle persisting collapse state in the
  URL via `?groups.<type>=closed`. When grouped, drop the per-row Type column
  (the header pill carries it). Read-only surfaces omit the checkbox / bulk /
  row-action machinery.
- **Color-coded usages/attachment cell** — a `<Pill tone dot mono>` linking to
  `?selected=<id>`; `success` when referenced ≥1, `warning` when 0,
  plain `—` when unknown. Tooltip names the referencing containers.
- **Detail drawer** — fixed split-view panel, **not** a modal `<Sheet>`. It
  publishes its width on `:root` via the `--workspace-drawer-width` CSS
  variable, which `(app)/layout.tsx` consumes as `padding-right`. Read
  `?selected=<id>`, find the row, render a consolidated scroll (banner →
  metadata → usages → code/JSON). **Clear the CSS var on close/unmount** or the
  page keeps a phantom right-padding. Esc closes. v1 can skip
  resize/fullscreen/tabs (those are workspace-mode extras).
- **`<Pill>`, `<TypePill>`, `<LastModifiedCell>`, `<FilterBar>`,
  `<FilterDropdown>`, `<StateView>`** — reuse as-is. Map error states with
  `<StateView intent={result.error.kind} …>` (`not_connected` / `auth_failed`
  / `api_error`).
- **Code viewer** — `highlightJson` only does JSON. For BeanShell/other, write
  a small escape-safe regex highlighter (see the rules `rule-code-panel.tsx`)
  rather than pulling in CodeMirror for a read-only view.

## Workflow & repo gotchas

- **Pre-build shape gate, no default ADR.** Per `~/brain/.claude/rules/pre-build-shape-gate.md`:
  if the architecture is already settled (you're mirroring transforms), there's
  **no open choice** → skip the ADR; just build. Capture any non-obvious
  decision made mid-build as a **Tier-2 annotation in the PR body** (a
  `## Decisions` section), not a separate doc. Only pause for a shape-gate
  question if a genuinely open trade-off appears.
- **Branch → PR → merge.** No direct commits to `main`. EN for GitHub
  (issues/PRs/commits/code), FR in conversation.
- **Tests.** Package tests use Node's built-in runner — `node
  --experimental-strip-types --test 'src/**/*.test.ts'` (the `test` script).
  Test the usages walker + lint with hand-built fixtures.
- **Verify before claiming done:** `pnpm --filter @simplified-identity/<thing>
  typecheck`, `pnpm --filter web typecheck`, package tests, then a **UI smoke**.
- **UI smoke on :3200.** The dev server runs on **3200** (baked into the `dev`
  script). If you work in a git worktree, the env + DB are gitignored — symlink
  them from the main checkout so you reuse the OAuth session (see
  `references/mirror-map.md` for the symlink commands), then drive the page
  with the browser tools (the localhost session cookie is shared, so an
  authenticated render works).
- **GitHub `Closes` gotcha.** A comma-listed `Closes #342, #343, #344` only
  auto-closes the **first** issue on merge. Either give each its own `Closes`
  keyword, or close the rest manually after merge.
- **Worktree env/DB are symlinks** — never commit them (they're gitignored);
  never `git add` `.env.local` or `data/*.sqlite`.

## Anti-patterns

- ❌ Importing `packages/<thing>` from `packages/sailpoint-client` (or vice
  versa). Duplicate the small DTO instead.
- ❌ Putting analysis logic (usages, lint) in the web layer or the shim. It
  goes in the pure package so it's testable and reusable.
- ❌ A modal `<Sheet>` drawer for the list surface — use the fixed split-view
  panel that publishes `--workspace-drawer-width`.
- ❌ Forgetting to clear the drawer width var on close (phantom padding).
- ❌ Writing a default ADR/SPEC for a surface that just mirrors transforms.
- ❌ Shipping an alarming lint banner ("will fail") for a condition you can't
  verify with v1's data scope — surface it neutrally (see the rules
  `unresolved-references-note`, where source refs to out-of-scope cloud rules
  are shown for awareness, not as errors).

## Reference

`references/mirror-map.md` — exact file-by-file mirror table (transforms →
new surface), the token-resolution shim snippet, the worktree symlink commands,
and the connector-rules PR (#349) as a worked read-only example.
