# Feature Roadmap

This file is meant to be a working checklist for the next product steps.
Order is based on practical relevance: core planning workflow first, security/admin next, and reporting/polish last.

## Completed

- **Year filters for construction sites and employees** — year dropdown in board filter panel, admin sites table, admin employees table; hides sites/employees with no assignment in the selected year.
- **Half-day sickness and vacation** — `Availability.dayPart`, half-day sick/vacation fly-outs, absence swimlane half-day chips, export weights half-day absences as 0.5 day.
- **"Back to pool" in the employee site picker** — divider + entry in `SitePickerPopover` when the card sits on a project cell; `sendToPool` in [useBoardState.ts](src/components/board/hooks/useBoardState.ts) mirrors `assignToSite`.
- **Apprentice role and school days** — role key list in [roles.ts](src/lib/roles.ts), intentionally limited to `apprentice` and `staff` for now; admin role select; one-off free-text migration ([normalize-employee-roles.ts](scripts/normalize-employee-roles.ts), already run against the local dev DB); `Availability.status` widened to include `school`; apprentice-only school fly-out button (graduation-cap icon); swimlane/statistics/export school bucket.

## Site-selective day copy (variant 1)

Goal:
Copying a day into another day becomes selective: a dialog lists all sites, all preselected, and the planner can deselect individual sites, deselect all, or pick just one.

Requirements:

- After choosing the source day in the existing copy popover, a dialog opens instead of copying immediately.
- Dialog lists every site visible on the board (respecting the active manager filter), each with a checkbox, all checked by default, plus "select all" / "deselect all".
- Dialog shows, per site, how many assignments exist on the source day and how many would be overwritten on the target day.
- Copy applies only to checked sites: assignments on the target day are deleted and replaced for those sites only; unchecked sites are untouched.
- Confirm button is disabled when nothing is selected.

Acceptance criteria:

- Deselecting site B and copying Monday → Tuesday leaves Tuesday's site B cells exactly as they were.
- Selecting a single site copies only that site's row.
- An employee who is absent on the target day is not re-assigned there by the copy.

Technical notes:

- `copyDayAssignments` ([board.ts](src/server/actions/board.ts)) takes an optional `projectIds: string[]`; when present, both the delete and the read are scoped to those projects.
- **Conflict rule (important):** a partial copy can hit the `[employeeId, date, dayPart]` unique constraint when the employee already sits on an *unselected* site on the target day. `createMany({ skipDuplicates: true })` would silently drop the copied row and keep the old one. Decide explicitly and apply the same rule in variant 2: skip the conflicting employee and report the count back to the UI (safer), rather than stealing them from the other site.
- Same skip applies to employees with an absence record on the target day.
- The current unconditional overwrite warning modal (`dayCopyConfirm`) is replaced by this dialog.

## Per-site day copy (variant 2)

Goal:
A single site's day cell can be filled from another day of the same week, via a copy control on the cell itself.

Requirements:

- Each site's day cell shows a small copy control (hover on desktop, always visible on touch, matching how the pool resize handle was handled).
- Clicking it opens a "copy from" dialog listing the other weekdays of the current week, each with the number of assignments on that day for this site.
- Picking a source day replaces this site's target-day cell with the source day's assignments for the same site.
- Same skip rule as variant 1 for employees who are absent or already booked elsewhere on the target day.

Acceptance criteria:

- Copying Wednesday → Friday for site A changes only site A's Friday cell.
- Days with no assignments for that site are shown but marked empty.
- Overwriting a non-empty target cell asks for confirmation first.

Technical notes:

- New action `copySiteDayAssignments(projectId, sourceDateIso, targetDateIso, weekId)` — effectively `copyDayAssignments` with a single-element `projectIds`, so both variants can share one server implementation.
- Both variants are intentionally shipped together to see which one planners actually reach for; keep the shared server action so dropping one later is a UI-only removal.

## Remove start and end date from construction sites

Goal:
Sites no longer carry a start/end date. The fields are unused by any logic and only confuse planners.

Requirements:

- Drop `startDate` and `endDate` from `Project` in the schema (verified: no scheduling, filtering, statistics or export logic reads them — they are CRUD and display only).
- Remove the two form fields, the two table columns, their sort keys, and the two columns from the site CSV import/export.
- CSV import stays tolerant: a file that still contains the old columns imports fine, the extra columns are ignored.

Acceptance criteria:

- Site create/edit dialog has no date fields; the sites table has no date columns.
- Importing an old export file (with date columns) succeeds without an error.
- `npm run check` passes with no unused type members left behind.

Technical notes:

- Touches [SitesClient.tsx](src/app/admin/sites/SitesClient.tsx), [sites/page.tsx](src/app/admin/sites/page.tsx), [sites.ts](src/server/actions/sites.ts), [types/index.ts](src/types/index.ts), [board.ts](src/server/services/board.ts) (pass-through only), and the schema.
- Migration name suggestion: `remove_project_start_end_date`. Destructive — the column data is gone; take a dump first if the dates might still be wanted.
- Employee `startDate`/`endDate` and `Week.startDate`/`endDate` are unrelated and stay.

## Fix all npm vulnerabilities

Goal:
`npm audit` reports zero vulnerabilities, and dependency drift is caught early from then on.

Current state (as of this writing): 9 vulnerabilities — 1 critical, 6 high, 1 moderate, 1 low.

| Package | Severity | Note |
| --- | --- | --- |
| better-auth ≤1.6.21 | critical | session/OAuth advisories, incl. stale sessions after user deletion |
| next | high | Server Actions DoS, middleware bypass, SSRF — this app uses Server Actions everywhere |
| postcss, sharp, js-yaml, kysely, brace-expansion | high | mostly transitive (next, better-auth toolchains) |
| next-intl ≤4.9.1 | moderate | prototype pollution via translation catalog keys |
| icu-minify | low | transitive of next-intl |

Requirements:

- `npm audit fix` resolves all of them without `--force` (confirmed by dry run), i.e. all fixes are inside the declared semver ranges — no major upgrade needed.
- After the fix: `npm run check`, `npx prisma generate`, then a manual smoke test of login, board drag/drop, and export.
- Pay attention to the `better-auth` jump (^1.3 → ≥1.6.22) — read its changelog for session/cookie behaviour changes before assuming the smoke test covers it.
- Add a recurring check: `npm audit --audit-level=high` as part of `npm run check` or a CI step, so this does not silently rot again.

Acceptance criteria:

- `npm audit` reports 0 vulnerabilities.
- Login, board mutations and export still work after the upgrade.

## Excel and PDF export

Goal:
The export page offers Excel (.xlsx) and PDF downloads next to the existing CSV, each as a real generated file — but only if the required libraries can be added without introducing new vulnerabilities.

Requirements:

- **Hard gate:** before adopting any library, install it in a scratch branch and run `npm audit`. Reject any candidate that brings an advisory of moderate severity or higher, including transitively. This gate is the point of the feature — no export is worth a new CVE.
- `/api/export` gains a `format` parameter (`csv` | `xlsx` | `pdf`); the export page gets a format selector and keeps the existing week/month/year range and layout (employee vs. site) options.
- Excel output: real workbook, header row frozen, one sheet per exported unit (or one sheet with a week column), numeric hour cells typed as numbers — not text — so planners can sum them.
- PDF output: landscape A4, one table per week, respects the layout toggle, includes the hours-per-day note in the footer.
- Both formats contain exactly the same data as the CSV for the same parameters.

Acceptance criteria:

- Exporting the same range as CSV, XLSX and PDF yields identical totals.
- `npm audit` is still clean after adding whichever libraries are chosen.
- Excel hour columns can be summed in Excel without re-typing the cells.

Technical notes — library evaluation:

- **Excel candidates:** `exceljs` (feature-rich, but has previously flagged in audit here — re-check current state before committing), `write-excel-file` (much smaller dependency surface), `xlsx-populate`. Avoid the npm-registry `xlsx` package (SheetJS): the registry copy is stale and carries known advisories, upstream distributes elsewhere.
- **Zero-dependency fallback for Excel:** an .xlsx is a zip of OOXML parts, and Node's built-in `node:zlib` can produce the deflate streams — a minimal writer for a plain table is a realistic afternoon of work and adds no dependency at all. Worth costing out if every library fails the audit gate.
- **PDF candidates:** `pdf-lib` (pure TS, no native and no runtime deps — evaluate first), `pdfkit`, `@react-pdf/renderer` (heaviest).
- **Zero-dependency fallback for PDF:** a dedicated print stylesheet plus a print-optimised route, and the user prints to PDF from the browser. No dependency, but no server-side file download.
- Reuse the existing aggregation in [export.ts](src/server/services/export.ts); the new formats are renderers over the same rows, not a second data path.
