---
type: analysis
project: simplified-identity
date: 2026-05-25
status: active
tags: [rules, ux, navigation, drawer-removal]
---

> Projet : [[Simplified Identity]]

## TL;DR

Replace `rule-drawer.tsx` (~982 LOC, 3 modes × 4 tabs) with a dedicated route pair: `/sailpoint/rules/[id]` (always-editable detail) and `/sailpoint/rules/new` (creation). The drawer was page-grade complexity packed into a 520 px side panel; moving to a route gives the BeanShell editor its full viewport width and eliminates the view→edit friction. Deprecated list-page query params (`?selected=`, `?new=1`, `?tab=`, `?fs=`) redirect to the new paths and are dropped from the list page.

Price: one-time migration effort; old bookmarks redirect transparently; no backward-compat shim in the new code.

## Principes

- One surface per entity, no mode switching — the edit page IS the edit surface.
- URL-addressable tabs on the detail page (`?tab=overview|signature|attachments`); edit is the default (no param).
- Reuse existing drawer sub-components without modification where possible.
- Same `DetailShell` / `DetailHeader` primitives as `/sailpoint/sources/[id]`.
- Soft-fail on expensive fan-out (source usages) — attachments degrade gracefully to "unavailable".

## Options évaluées

| Option | For | Against | Verdict |
|--------|-----|---------|---------|
| Keep drawer, add full-screen toggle | No new route | Drawer FSM stays; editor cramped by default | ✗ |
| Detail page + keep drawer as shortcut | Gradual migration | Double implementation; diverges fast | ✗ |
| **Detail page, delete drawer** | Clean codebase; full-width editor; URL-first | One-time migration effort | ✓ |

## Recommandation détaillée

`/sailpoint/rules/[id]` is a Next.js server component using `DetailShell` + `DetailHeader` (same primitives as `/sailpoint/sources/[id]` and `/sailpoint/transforms/[id]`). It fetches the rule by ID, the sources list (for the attachment picker), and fans out per source to compute usages (same `computeRuleUsages` call as the list page). Four URL-driven tabs: Edit (default), Overview, Signature, Attachments. The Edit tab renders `RuleEditor` at full width in edit mode — no consult / edit toggle.

`/sailpoint/rules/new` is a minimal server component that renders `RuleEditor` with `mode={{ kind: "new" }}` inside a `DetailShell`.

A new client component (`rule-page-client.tsx`) exports three pieces: `RulePageActions` (Duplicate/Delete/Explain buttons + dialogs), `RulePageEditor` (wraps `RuleEditor` with page-level navigation callbacks), and `RuleOverviewClient` (Overview tab content with "fix in editor" linking to Edit tab).

## Plan

1. ✅ Write this ADR.
2. Create `apps/web/app/(app)/sailpoint/rules/[id]/page.tsx`.
3. Create `apps/web/app/(app)/sailpoint/rules/[id]/_components/rule-page-client.tsx`.
4. Create `apps/web/app/(app)/sailpoint/rules/new/page.tsx`.
5. Update `rules-table.tsx`: row href → `/sailpoint/rules/${id}`.
6. Update `new-rule-button.tsx`: simple Link to `/sailpoint/rules/new`.
7. Update `rules/page.tsx`: add redirects for `?selected` / `?new`, remove `<RuleDrawer>`.
8. Delete `rule-drawer.tsx`.
9. Smoke-test on `:3200`.

## Gaps & revisites

- `computeRuleUsages` fan-out is duplicated between list page and detail page — deferred to a perf pass (caching or a shared server action).
- "Fix in editor" from the Overview tab currently passes the issue line number via `?line=` URL param; the `RuleEditor` receives it as `initialCaretLine`. Works on page load but resets if the user navigates away and back.
- Layout chrome cleanup (`--workspace-drawer-width` CSS variable, fixed `<aside>` primitives) — handled in the cleanup issue once both the rules and transforms drawer-to-page migrations land.

## Suivi

- Issue #381 — this implementation.
- Layout chrome cleanup (TBD issue) — CSS variable leftover from the drawer.
