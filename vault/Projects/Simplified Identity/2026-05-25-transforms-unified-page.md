---
type: analysis
project: simplified-identity
date: 2026-05-25
status: active
tags: [transforms, ux, navigation, drawer]
---

> Projet : [[Simplified Identity]]

## TL;DR

Collapse the three overlapping transforms surfaces (drawer, read-only detail page, edit page) into **one editable page** at `/sailpoint/transforms/[id]`. Custom transforms open in edit-capable state on arrival. UsagesTab (full list) and DependsOnList (interactive mini-graph for ≤6 deps, text list otherwise) are lifted as page sections into the left column of the unified editor. Costs one additional page-load API call (identity-profiles + sources with policies for the usage map) that was previously lazy-loaded in the drawer.

## Principes

- One surface per entity, editable on arrival — no Edit-button ceremony.
- Drawer anti-pattern: as soon as a panel grows tabs + an editor + its own routing grammar, it is a page in disguise — move it.
- Split-pane for Test (xl+: side-by-side; <xl: stacked below) preserves the "see test while editing" benefit that was the drawer's only real virtue.
- Best-effort degradation: usage / lint failures must not break the page.

## Options évaluées

| Option | Pour | Contre | Verdict |
|--------|------|--------|---------|
| Keep drawer | Existing code | Page-in-disguise anti-pattern; cramped editor width | ✗ Rejected |
| Unified page, test as tab (`?tab=test`) | Consistent with `/identities/[id]` | Loses simultaneous edit+test | ✗ Rejected |
| Unified page, test as split-pane (xl+) | Preserves edit+test side-by-side | ~3-4 days impl | ✓ Chosen |

## Recommandation détaillée

**`/sailpoint/transforms/[id]`** is the single surface:

- **Custom transforms** → `TransformEditor` (already editable on arrival). Left column: Name/type, Definition editor, Usages section (full list), Depends-on section (mini-graph ≤6 deps, text list otherwise). Right aside (xl+): Test / JSON / Tree tabs.
- **Internal (built-in) transforms** → read-only detail view with Duplicate CTA (identical to the old detail page, since ISC API forbids mutation).

`?selected=<id>` on the list page server-redirects to `/sailpoint/transforms/<id>`. All row clicks / grid card clicks / usages badge links navigate there directly.

## Plan

1. Write ADR (this file) ✓
2. Delete `transform-drawer.tsx` (~1253 LOC) ✓
3. Delete `[id]/edit/page.tsx` ✓
4. Rewrite `[id]/page.tsx` — unified server page ✓
5. Extend `transform-editor.tsx` — add `UsagesTab` + `DependsOnList` sections, fix post-save redirect ✓
6. Update `page.tsx` (list) — remove drawer, add `?selected=<id>` redirect ✓
7. Update `transforms-table.tsx` + `transforms-grid.tsx` — selectHref → direct `/[id]` ✓
8. Update `usages-cell.tsx` — badge href → `/[id]` ✓
9. Update `detail-actions.tsx` — remove Edit button (route deleted) ✓

## Gaps & revisites

- **Lint / IssuesBanner on the unified page**: the editor does not yet fetch lint data. The IssuesBanner from the drawer is not ported — deferred to a follow-up once the cleanup issue (#382) settles the lint architecture for page surfaces.
- **CSS variable cleanup (`--workspace-drawer-width`)**: scoped to issue #382 per the issue brief.
- **Test panel on narrow viewports (<xl)**: stacked below the editor, same as the existing edit page behavior.
- **`DependsOnGraph` navigates to `/sailpoint/transforms/<id>`** (router.push) — no longer the `history.replaceState` trick the drawer used.

## Suivi

- Issue #380: Transforms — collapse drawer + detail + edit into a single editable page
- Issue #382: Cleanup — CSS variable + layout chrome (out of scope here)
