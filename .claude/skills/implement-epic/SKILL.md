---
name: implement-epic
description: >-
  Take a GitHub epic (parent issue + sub-issues) in the Simplified Identity repo
  from open issue to a merged feature verified in the browser. Use when the user
  says "implement epic #N", "build out issue #N and its sub-issues", or hands you
  a multi-issue feature to ship. Prefer this over ad-hoc implementing — it bakes
  in the browser-verification and ship steps ad-hoc work forgets.
---

Take the epic from open issue to a feature you've watched work in the browser.

Read **every sub-issue** first, not just the parent — the real scope lives in the
children. Build it in a worktree, mirroring the existing surface the epic points
at. The design is usually already settled in the epic thread, so don't write an
ADR — just build, and note any non-obvious call in the PR's `## Decisions`.

The discipline that matters: green typecheck and tests don't mean done. Serve the
app on :3200 and drive the real feature through the **claude-in-chrome** extension
against **real tenant data** — open the drawer, toggle filters, read the actual
counts. When the live data contradicts what the code assumes, stop and ask me
before shipping; that's where the real bugs hide.

Then ship normally: PR with a short Decisions note, squash-merge, close the epic
and **every** sub-issue (a comma-listed `Closes #a, #b` only closes the first, so
close the rest by hand), and clean up the worktree. Keep client/tenant names out
of anything public.

For the repo specifics — the worktree env/DB symlinks + :3200 setup, and the
file-by-file recipe when the epic is a new SailPoint inventory/list surface — read
`references/inventory-surface.md`.
