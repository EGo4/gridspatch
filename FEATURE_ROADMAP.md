# Feature Roadmap

This file is meant to be a working checklist for the next product steps.
Order is based on practical relevance: core planning workflow first, security/admin next, and reporting/polish last.

## Completed

- **Year filters for construction sites and employees** — year dropdown in board filter panel, admin sites table, admin employees table; hides sites/employees with no assignment in the selected year.
- **Half-day sickness and vacation** — `Availability.dayPart`, half-day sick/vacation fly-outs, absence swimlane half-day chips, export weights half-day absences as 0.5 day.
- **"Back to pool" in the employee site picker** — divider + entry in `SitePickerPopover` when the card sits on a project cell; `sendToPool` in [useBoardState.ts](src/components/board/hooks/useBoardState.ts) mirrors `assignToSite`.
- **Apprentice role and school days** — role key list in [roles.ts](src/lib/roles.ts), intentionally limited to `apprentice` and `staff` for now; admin role select; one-off free-text migration ([normalize-employee-roles.ts](scripts/normalize-employee-roles.ts), already run against the local dev DB); `Availability.status` widened to include `school`; apprentice-only school fly-out button (graduation-cap icon); swimlane/statistics/export school bucket.
- **Site-selective day copy, both variants** — shipped together as planned, sharing one server implementation. Variant 1: picking a source day from the day-header popover opens [SiteCopyDialog](src/components/board/modals/SiteCopyDialog.tsx) (all sites checked by default, per-site source/target counts, replaces the old unconditional overwrite-confirm modal) instead of copying immediately. Variant 2: a small copy control on each site's own day cell opens [SiteDayCopyPopover](src/components/board/modals/SiteDayCopyPopover.tsx) listing the week's other days with per-day counts for that one site. Both call `copyDayAssignments`/`copySiteDayAssignments` ([board.ts](src/server/actions/board.ts)), which now takes an optional `projectIds` scope and skips (and counts) employees already booked on an unselected site or absent on the target day rather than silently dropping or stealing them — see [copyScoped.ts](src/components/board/copyScoped.ts) for the shared optimistic-state/conflict logic used by both variants' UI.

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
