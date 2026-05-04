# Feature Roadmap

This file is meant to be a working checklist for the next product steps.
Order is based on practical relevance: core planning workflow first, security/admin next, and reporting/polish last.

## Bulk editing for site status and manager

Goal:
Allow selecting multiple sites in the admin table and applying a status or manager change to all of them at once.

## ✓ Fix half-day drop target offset diverging from visual box

Fixed in `BoardClient.tsx`. Root cause: at half-day drag start, every cell in the
dragged day's column whose `hasHalves` was false expanded its AM/PM area from
`half-col-collapsed` (32px) to `half-col-visible` + padding (~60px). That mid-drag
layout shift cascaded — each expanded row pushed all rows below it down by Δ —
but `@hello-pangea/dnd` snapshots droppable bounds at drag start and doesn't
recompute on layout changes. So row N's hit area sat `(expanded_rows_above_N) × Δ`
above its visual box. Further down ⇒ more expansions above ⇒ larger gap.

Fix: split the flag. `showHalfSection` (drives layout: size, padding, divider,
labels) now depends only on `hasHalves`. A new `showDropHint` toggles opacity and
background color during the drag without changing size, so the user still sees
the AM/PM zones light up but no layout shift happens.
