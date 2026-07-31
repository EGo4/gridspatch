# Feature Roadmap

This file is meant to be a working checklist for the next product steps.
Order is based on practical relevance: core planning workflow first, security/admin next, and reporting/polish last.

## Year filters for construction sites and employees

Goal:
Site and employee filters get a year option: show only sites/employees that were **active in that year** (i.e. have at least one assignment dated in that year).

Requirements:

- Year dropdown added wherever site/employee filters exist (board filter panel, admin sites table, admin employees table).
- "Active in year X" = has ≥1 assignment with `date` in year X (for employees additionally counts absences? default: assignments only).
- Year list derived from the data (years that actually have assignments), plus "all".

Acceptance criteria:

- Selecting 2025 hides sites/employees without any 2025 assignment.
- Combines with existing filters (status, search) as AND.

Technical notes:

- Needs a lightweight aggregate query (distinct years, activity per year); avoid loading all assignments client-side.

## Half-day sickness and vacation

Goal:
Sickness and vacation can be recorded for half a day. The other half of that day stays fully planable — the employee appears both in the absence swimlane and on a site (or in the pool) on the same day.

Requirements:

- `Availability` gains a `dayPart` (`full_day` | `pre_lunch` | `after_lunch`); unique key becomes `[employeeId, date, dayPart]`.
- Entry point: split an employee's day with the existing split button, then use the sick/vacation buttons on the resulting half card. Half-day cards must expose sick/vacation fly-outs (today only full-day cards do).
- Full-day cards keep the current behaviour: sick/vacation there means the whole day.
- Marking one half absent deletes only that half's assignment. A `full_day` assignment on the same date is converted into the surviving half (site kept), not deleted.
- Marking a full day absent removes any half-day absence records for that date. Marking both halves absent with the same status collapses into a single `full_day` record.
- The absence swimlane renders half-day chips distinguishable from full-day ones, using the existing AM/PM colour variables (`--am-card` / `--pm-card`).
- The free half shows up in the pool as a half card when it is not assigned to a site.

Acceptance criteria:

- Employee marked sick `pre_lunch` while assigned full day to site A → after reload: absence chip AM, half-day card on site A PM.
- Marking `after_lunch` sick as well → the two records collapse to one full-day sick entry, no assignment left that day.
- Clearing a half-day absence returns only that half to the pool; the other half's assignment is untouched.
- Hours export counts a half-day absence as 0.5 day, not 1.

Technical notes:

- Migration: `ALTER TABLE "Availability" ADD COLUMN "dayPart"` defaulting to `full_day`, drop old unique, add the 3-column unique.
- `setAvailability` / `clearAvailability` in [board.ts](src/server/actions/board.ts) take a `dayPart` argument.
- `BoardClient`'s `availability` state is keyed `${employeeId}-${day}`; it must become `${employeeId}-${day}-${dayPart}`. The `unavailableSet` filtering that currently drops assignments and pool entries for absent employees has to become day-part aware, otherwise the worked half disappears.
- `setHoliday` (company holiday → everyone on vacation) writes `full_day` records.
- Copy day / copy week must not resurrect assignments that collide with an absence on the target day — see the conflict rule under "Site-selective day copy".
- [export.ts](src/server/services/export.ts) already weights assignments via `DAY_WEIGHT`; availability records need the same weighting.

## "Back to pool" in the employee site picker

Goal:
The site picker that opens from an employee card (the "assign to site" fly-out) gets a "Back to pool" entry, so a worker can be removed from a site without dragging.

Requirements:

- Entry rendered in the site picker overlay, visually separated from the site list (divider + own icon), only when the card is currently in a project cell.
- Works for full-day and half-day cards; only the card's own `dayPart` moves back.
- Optimistic UI like the existing `assignToSite` path, persisted through the mutation queue.
- Respects the existing past-week edit confirmation (`confirmPastEdit`).

Acceptance criteria:

- Clicking an employee on a site → picker shows "Back to pool" → click → card moves to that day's pool cell and survives reload.
- On a half-day card only that half leaves the site; the other half stays where it is.
- Pool cards do not show the entry (nothing to send back).

Technical notes:

- Add a `sendToPool(employeeId, day, sourceCellId)` next to `assignToSite` in [BoardClient.tsx](src/components/board/BoardClient.tsx); target cell is `poolFullDayId(day)` regardless of day part.
- Persists via `updateAssignment(employeeId, null, dateIso, weekId, dayPart)` — the existing action already deletes on a null project.
- Needs new i18n keys in `messages/en.json` and `messages/de.json` ("Back to pool" / "Zurück in den Pool").

## Apprentice role and school days

Goal:
Employees get a structured role. Employees with the apprentice role ("Lehrling") can be marked as being at vocational school for a day (or half a day), which is a third absence type next to sick and vacation.

Requirements:

- Roles become a known key list (`src/lib/roles.ts`, e.g. `apprentice`, plus the roles actually in use today), with translated labels per locale — German UI shows "Lehrling", English shows "Apprentice".
- Admin employee form: role free-text input becomes a select over those keys, "no role" allowed.
- One-off data migration maps existing free-text role values case-insensitively onto the new keys; unmapped values are set to null and listed in the migration output so nothing is silently lost.
- `Availability.status` gains `school` alongside `sick` / `vacation`.
- The school action is only offered on cards of employees whose role is `apprentice`.
- School supports the same day parts as the other absence types (see "Half-day sickness and vacation").
- Absence swimlane renders school entries with their own icon and colour; the swimlane heading/label covers all three statuses.
- Statistics and the hours export report school as its own bucket — it is absence, but neither sick nor vacation.

Acceptance criteria:

- An employee with role apprentice shows a school button on the card; a non-apprentice does not.
- Marking school for a day clears that day's assignments and shows the employee in the absence swimlane with the school icon.
- Changing an employee's role away from apprentice in admin leaves existing school records intact.
- Export/statistics show school days separately from sick and vacation.

Technical notes:

- Keep the DB column as `String` and validate against the key list with Zod rather than introducing a Prisma enum — avoids a lock-in migration every time a role is added.
- The board's `Employee` type ([types/index.ts](src/types/index.ts)) carries only `id`/`name`/`img`; it needs `role`, and [board.ts](src/server/services/board.ts) has to select it.
- `AvailabilityStatus` in [BoardClient.tsx](src/components/board/BoardClient.tsx) widens to `"sick" | "vacation" | "school"`.
- New icon in `src/components/icons` (backpack/school).
- Depends on half-day absences if school should be half-day capable; can ship full-day first.

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
