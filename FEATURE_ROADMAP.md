# Feature Roadmap

This file is meant to be a working checklist for the next product steps.
Order is based on practical relevance: core planning workflow first, security/admin next, and reporting/polish last.

## Completed

- **Year filters for construction sites and employees** — year dropdown in board filter panel, admin sites table, admin employees table; hides sites/employees with no assignment in the selected year.
- **Half-day sickness and vacation** — `Availability.dayPart`, half-day sick/vacation fly-outs, absence swimlane half-day chips, export weights half-day absences as 0.5 day.
- **"Back to pool" in the employee site picker** — divider + entry in `SitePickerPopover` when the card sits on a project cell; `sendToPool` in [useBoardState.ts](src/components/board/hooks/useBoardState.ts) mirrors `assignToSite`.
- **Apprentice role and school days** — role key list in [roles.ts](src/lib/roles.ts), intentionally limited to `apprentice` and `staff` for now; admin role select; one-off free-text migration ([normalize-employee-roles.ts](scripts/normalize-employee-roles.ts), already run against the local dev DB); `Availability.status` widened to include `school`; apprentice-only school fly-out button (graduation-cap icon); swimlane/statistics/export school bucket.
- **Site-selective day copy, both variants** — shipped together as planned, sharing one server implementation. Variant 1: picking a source day from the day-header popover opens [SiteCopyDialog](src/components/board/modals/SiteCopyDialog.tsx) (all sites checked by default, per-site source/target counts, replaces the old unconditional overwrite-confirm modal) instead of copying immediately. Variant 2: a small copy control on each site's own day cell opens [SiteDayCopyPopover](src/components/board/modals/SiteDayCopyPopover.tsx) listing the week's other days with per-day counts for that one site. Both call `copyDayAssignments`/`copySiteDayAssignments` ([board.ts](src/server/actions/board.ts)), which now takes an optional `projectIds` scope and skips (and counts) employees already booked on an unselected site or absent on the target day rather than silently dropping or stealing them — see [copyScoped.ts](src/components/board/copyScoped.ts) for the shared optimistic-state/conflict logic used by both variants' UI.
- **Remove start and end date from construction sites** — dropped from the `Project` schema (migration `remove_project_start_end_date`), the type, the create/edit form, table columns/sort keys, and JSON import/export in [SitesClient.tsx](src/app/admin/sites/SitesClient.tsx); pass-through mapping removed from [sites.ts](src/server/actions/sites.ts) and [board.ts](src/server/services/board.ts). Import stays tolerant of old exports carrying the extra fields — they're just not read. Employee `startDate`/`endDate` and `Week.startDate`/`endDate` were unrelated and untouched.
- **Fix all npm vulnerabilities** — `npm audit` at 0 (was 28: 2 critical, 14 high by the time work started, up from the 9 originally listed). In-range bumps: next 15.5.29, better-auth 1.7.25, next-intl 4.15, vitest 4.1.12, typescript-eslint 8.72, postcss 8.5.33; one major: zod 3→4 with @t3-oss/env-nextjs 0.13 (no code changes needed — no zod-3-only APIs in use). `overrides` in package.json for three upstream exact pins with no in-range fix: next→postcss 8.4.31, @prisma/config→deepmerge-ts 7.1.5, typescript-estree→minimatch ^10. better-auth 1.7 now validates the DB schema at startup and fails every auth request on a mismatch, so `Session.impersonatedBy` (admin plugin) was added — migration `add_session_impersonated_by`. `npm run check` now ends with `npm audit --audit-level=high` (`audit:deps` script). Smoke-tested against a prod build: login/bad password/forged cookie/sign-out, a real `setHoliday`/`clearHoliday` server-action round trip incl. zod rejection, and CSV export in both layouts.
- **Board: cell content no longer paints above the sticky day header** — the sticky day-header row and the various in-flow board elements were tied or inverted on `z-index` inside one shared stacking context, so the per-cell copy button, an open card's fly-outs, and the status-transition popover all painted over the header while scrolling. Re-ordered to a documented ladder (comment above `// ── Theme toggle` in [BoardClient.tsx](src/components/board/BoardClient.tsx)): header now `z-[35]`, open-card wrapper `z-[25]` ([EmployeeCard.tsx](src/components/board/EmployeeCard.tsx)), status popover and copy button unchanged (`z-30`/`z-20`) — all still below every modal/popover/drag-clone layer. Deliberately not solved with `isolation`/`contain` on `main` or a row, which would trap `@hello-pangea/dnd`'s dragged clone behind later rows mid-drag.

## Board: site picker must stay inside the viewport and scroll

Type: bug, board polish.

Symptom:
Opening "assign to site" on a card when many sites are active, the list of sites grows past the top edge of the screen. The first entries (and the "Assign to site" heading) are unreachable, and since `html, body { overflow: hidden }` ([globals.css:8](src/styles/globals.css#L8)) the page cannot be scrolled to get to them either.

Root cause:
[SitePickerPopover.tsx](src/components/board/modals/SitePickerPopover.tsx) is `position: fixed` and anchored by its **bottom** edge to the button that opened it (`--picker-bottom`, set in the `useLayoutEffect` at line 28–33; CSS in [globals.css:710](src/styles/globals.css#L710)). It has no `max-height` and no internal scroll container, so it simply grows upward. The card that opens it usually sits in the pool at the bottom of the screen, so "upward" is the whole viewport — and with more sites than fit, off it.

Requirements:

- The popover never extends beyond the viewport, whatever the number of sites and whatever the anchor position.
- When the list is taller than the available space, the site list scrolls internally; the "Assign to site" heading stays pinned at the top and the "Back to pool" entry (when present) stays pinned at the bottom, both always reachable.
- Anchoring stays the same (opens upward from the button) — this is a clamp, not a redesign. Flipping to open downward when there is more room below is a nice-to-have, not required.
- Works with `--ui-scale` ≠ 1 and on a phone-height viewport.

Implementation:

- In the `useLayoutEffect`, next to `--picker-left`/`--picker-bottom`, set a third variable: `--picker-max-h = max(MIN, sitePickerFor.top - 8 - MARGIN)` px, where 8 is the existing gap above the button and `MARGIN` ~16px keeps it off the very top edge; `MIN` ~120px so the heading plus a couple of rows always show. `sitePickerFor.top` is the opening button's `getBoundingClientRect().top` (see `onAssignToSite` in [EmployeeCard.tsx:114,182](src/components/board/EmployeeCard.tsx#L114); the `SitePickerTarget` type is in [board/types.ts:15](src/components/board/types.ts#L15)). Nothing else in the anchor needs to change.
- [globals.css](src/styles/globals.css) `.site-picker`: add `max-height: var(--picker-max-h, none);`. `SiteDayCopyPopover` shares the class but never sets the variable, so it is unaffected.
- Restructure the popover's root to `flex flex-col` (keep `overflow-hidden` and the rounding on the root). Heading: `flex-shrink-0`. Wrap the `projects.map(...)` buttons in `<div className="min-h-0 flex-1 overflow-y-auto">`. The divider + "Back to pool" block: `flex-shrink-0`.
- If you do the optional flip: add `bottom: rect.bottom` to the anchor, and when `spaceAbove < ~240px && spaceBelow > spaceAbove` set `--picker-top` and `bottom: auto` instead — [SiteDayCopyPopover.tsx:57](src/components/board/modals/SiteDayCopyPopover.tsx#L57) already shows the inline-style override pattern for a top-anchored `.site-picker`.

Acceptance criteria:

- Seed 40 active sites, open the picker from a pool card on Monday: the popover's top edge is on screen, the heading is visible, the list scrolls with the mouse wheel and by keyboard (Tab through entries scrolls them into view), "Back to pool" (from a project card) is always visible without scrolling the list.
- Same at 80% and 120% UI scale, and in a 600px-tall window.
- Component test (Vitest, `test/components/`): render `SitePickerPopover` directly with ~40 projects and `sitePickerFor.top = 100` under jsdom (`window.innerHeight` defaults to 768) and assert `--picker-max-h` equals `100 − 8 − MARGIN` px and the list container has `overflow-y-auto`. jsdom does no layout, so assert the computed variable and structure, not pixels.

## Sites: default initial status for new sites (company setting)

Type: feature, planning workflow. Ships together with the quick-select below — the quick-select without a default is only half the feature, and the default without a quick-select still hides the choice.

Why this matters more than it looks:
A site's status is derived from `ProjectStatusTransition` rows; with none, it is `planned` everywhere (`getEffectiveStatus` in [sites.ts:18](src/server/actions/sites.ts#L18), [services/board.ts:152](src/server/services/board.ts#L152), [admin/sites/page.tsx:29](src/app/admin/sites/page.tsx#L29)). The board only receives sites whose super-status is `ongoing` (active / on hold) — [services/board.ts:150–155](src/server/services/board.ts#L150) — so **a freshly created site does not appear on the board at all** until someone records an `active` transition from the admin page. Today that is an extra trip per site. (Side note: the `isPlanned` dimming in [BoardClient.tsx:1109](src/components/board/BoardClient.tsx#L1109) is dead code for the same reason — planned sites never reach the board.)

Scope decision: this is a **company-wide** setting on the admin Company settings page (`CompanySettings` singleton row), not a per-user preference. Only admins change it (`updateCompanySettings` already enforces that); every role that creates sites gets the same default.

Requirements:

- New setting "Default status for new sites" with exactly three values: Planned (current behaviour, the default), Active, On hold. `inactive`/`done` are not offered — they are end states.
- Lives on `/admin/settings` in the existing "Company" card next to "Hours per full day", as a three-chip segmented control, saved by the same "Save changes" button.
- A site created with a non-planned default gets a real `ProjectStatusTransition` for the **current week** (the week the site is created in), so the status is visible on the board from that week on and the admin "Status transitions" panel shows it as a recorded transition. Earlier weeks stay `planned` — that is correct.
- The setting is only a *default*; the create form (next item) shows and can override it per site.
- Imports (paste list / JSON) honour the same default — they are creation too, and `bulkCreateSites` is the same code path.
- Reading the setting stays open to every authenticated role (`getCompanySettings` is read-only and unguarded by convention — see CLAUDE.md); only the write is admin-gated.

Implementation:

1. Schema — [prisma/schema.prisma](prisma/schema.prisma) `CompanySettings`: add `defaultSiteStatus String @default("planned")` (`"planned" | "active" | "on_hold"`). Non-null with a default is the right shape for a singleton settings row — it means `getCompanySettings` can keep its "row may not exist yet" fallback with a plain constant, like `DEFAULT_HOURS_PER_DAY`. Run `npx prisma migrate dev --name company_settings_default_site_status` locally (`migrations/` is gitignored; the container applies schema changes with `prisma db push` from [docker-entrypoint.sh](docker-entrypoint.sh), so nothing else is needed for deployment).
2. Validation — [validation.ts](src/server/validation.ts): `export const zInitialSiteStatus = z.enum(["planned", "active", "on_hold"]);` — do not reuse `zProjectStatus`, it would let `done`/`inactive` through.
3. Settings action — [settings.ts](src/server/actions/settings.ts): `getCompanySettings()` returns `{ hoursPerDay, defaultSiteStatus }` (fallback `"planned"` when no row). Change `updateCompanySettings(hoursPerDay: number)` to take one object `{ hoursPerDay, defaultSiteStatus }` parsed by a `z.object({ hoursPerDay: zHoursPerDay, defaultSiteStatus: zInitialSiteStatus })` — a second positional parameter would be the quick hack, but the settings page saves everything in one click anyway and the next setting would make it a third. Keep the existing admin check; the `upsert`'s `create` must include the new field.
4. Settings page — [SettingsClient.tsx](src/app/admin/settings/SettingsClient.tsx): new prop `defaultSiteStatus`, state seeded from it, a field under "Hours per full day" rendering the three chips with the `Status` translations (reuse `STATUS_CHIP_BG`/`STATUS_CHIP_TEXT` styling — they live in `SitesClient.tsx` today; move them to a small shared module, e.g. `src/components/statusChipStyles.ts`, since the quick-select below needs them too). `handleSave` calls `updateCompanySettings({ hoursPerDay: parsed, defaultSiteStatus })`. [admin/settings/page.tsx](src/app/admin/settings/page.tsx) passes the new value through.
5. Create action — [sites.ts](src/server/actions/sites.ts) `createSite`: schema gains `status: zInitialSiteStatus.optional()`. When `status` is `active` or `on_hold`, create the project and its first transition atomically with a nested write:
   ```ts
   const weekStart = normalizeWeekStart(toDateParam(new Date())); // same as bulkUpdateSites
   await db.project.create({
     data: {
       name, description, constructionManagerId,
       status: parsed.status ?? "planned",
       ...(parsed.status && parsed.status !== "planned" && {
         statusTransitions: { create: { weekStartDate: weekStart, status: parsed.status } },
       }),
     },
   });
   ```
   Do **not** write a transition for `planned` — it is the implicit default and `setSiteTransition`'s prune loop would delete it as redundant anyway. Also write the `Project.status` column (one line) so it stops lying for new sites; today it is only read by the on-hold default-collapse seed in [useBoardState.ts:287](src/components/board/hooks/useBoardState.ts#L287).
6. Bulk create — `bulkCreateSites(items, status?)`: same optional parameter, same nested create per item.
7. Sites page — [admin/sites/page.tsx](src/app/admin/sites/page.tsx): add `getCompanySettings()` to the existing `Promise.all` and pass `defaultSiteStatus={settings.defaultSiteStatus}` to `SitesClient`.
8. i18n, both [en.json](messages/en.json) and [de.json](messages/de.json): `Settings.defaultSiteStatusLabel` ("Default status for new sites"), `Settings.defaultSiteStatusHint` ("Applied when anyone creates or imports a site; it can still be changed per site on creation."). Status labels come from the existing `Status` namespace.
9. Tests: `sites.ts` is a `"use server"` module with no injectable client. If you want the create path unit-tested (recommended, it now has a branch), extract `createSiteRecord(db: SiteCreateDb, input)` into `services/sites.ts` following the `services/boardMutations.ts` pattern from CLAUDE.md, and test "active → project + one transition at current week start", "planned → project, zero transitions".

Acceptance criteria:

- As admin: Company settings → set default to Active → save. As any role: Sites → Add site → Create: the site appears on the board for the current week immediately, its status chip reads Active, and the admin Status transitions panel lists one transition "From <this week>: Active".
- As a non-admin, calling `updateCompanySettings` directly (it is its own POST endpoint) is still rejected; `getCompanySettings` still works for every role.
- Default Planned: behaviour is byte-for-byte what it is today (no transition rows created).
- Default On hold: the site shows in the board's collapsed on-hold section for the current week.
- Navigating the board to *last* week: the new site is not there (it is `planned` before its creation week).
- Paste-list import of 3 names with default Active: all three get a transition.
- `npm run check` and `npm run test` pass.

## Sites: initial-status quick select on the create form

Type: feature, planning workflow. Depends on the company setting above; small on its own.

Goal:
When creating a site, the planner sees which status it will start with and can change it in one click, without opening the status-transitions panel afterwards.

Requirements:

- [SitesClient.tsx](src/app/admin/sites/SitesClient.tsx) `SiteFormPanel` gets an "Initial status" field: three chips Planned / Active / On hold, in that order, one selected. Preselected from the company setting (`defaultSiteStatus` prop, see above), so a planner who never touches it gets the company default.
- **Create mode only** (`!isEdit`). In edit mode the field is hidden: status changes on existing sites go through `SiteStatusPanel` (per-week transitions) and must not be duplicated by a second, week-less control.
- A small hint under the field says the default comes from Company settings (admins); no link for non-admins — they cannot open that page.
- The two import panels (`SiteListImportPanel`, `SiteJsonImportPanel`) get the same chip row in their footer, same default, and pass the choice to `bulkCreateSites`.

Implementation:

- `FormState` gains `status: "planned" | "active" | "on_hold"`; `EMPTY_FORM` can no longer be a constant — build it from the prop: `const emptyForm = (): FormState => ({ ...EMPTY_FORM, status: defaultSiteStatus })` and use it in `openAdd`. `openEdit` can keep setting `status` to the site's current one; it is not rendered or sent in edit mode.
- Chip styling: the `STATUS_CHIP_BG` / `STATUS_CHIP_TEXT` maps (what `SiteStatusPanel` uses for its transition chips, and what the settings page now uses too — see step 4 above) so all three places look identical. Selected chip: `${STATUS_CHIP_BG[s]} ${STATUS_CHIP_TEXT[s]} ring-1 ring-white/30`, unselected: the muted variant used at [SitesClient.tsx:488–492](src/app/admin/sites/SitesClient.tsx#L488). Worth extracting a tiny `StatusChoice` component (`value`, `options`, `onChange`) used by the settings page, the create form and the two import panels rather than pasting the chip row four times.
- `handleSave`: `createSite({ ..., status: form.status })`; `updateSite` unchanged.
- i18n: `Sites.initialStatus` ("Initial status"), `Sites.initialStatusHint` ("Default set in Company settings."). Reuse `Status.*` for the chip labels.
- No new server code beyond the company-setting item — `createSite`/`bulkCreateSites` already accept `status` after that.

Acceptance criteria:

- Add site: the chip row shows with the company default preselected; picking another chip and creating yields that status (verify via the board and the transitions panel as above).
- Edit site: no chip row.
- Company default = On hold, quick-select = Active on one site: that site is Active; the next new site defaults back to On hold.
- Logged in as `hr` or `construction_manager`: the create form shows the admin-set default and the override works the same.
- Import a pasted list with Active selected: every imported site is Active.

## Audit: collapse guard for occupied site rows (commit `693d461`)

Type: audit of shipped work + follow-ups. The question was whether "rows with people can't be collapsed" and "a collapsed row opens on its first assignment" are actually realised. Short answer: **yes, both work** — and for a better reason than an event hook. Three gaps, one of them a real hiding-employees bug of the same kind the commit fixed.

What is implemented and correct:

- `projectHasAssignments` ([BoardClient.tsx:370](src/components/board/BoardClient.tsx#L370)) scans all 15 cells (5 days × full/AM/PM) of the row on every render; `canCollapse = !projectHasAssignments(id)` and `isCollapsed = canCollapse && stored` ([BoardClient.tsx:1106](src/components/board/BoardClient.tsx#L1106)). Because `isCollapsed` is *derived* from live `assignmentsState` rather than flipped by an event, a collapsed row opens the moment any path adds a person — site picker, copy day, copy previous week, per-site day copy, split — including optimistic state before the server confirms. Drag can't target a collapsed row (no droppables rendered), so it needs no handling.
- The chevron button is `disabled` with the `cannotCollapse` tooltip; the stored localStorage flag is left in place but ignored while occupied. `cannotCollapse` exists in both `en.json` and `de.json`.
- `assignToSite` ([useBoardState.ts:118–126](src/components/board/hooks/useBoardState.ts#L118)) additionally deletes the stored flag so the row does not snap shut when it empties again.

Gaps to fix:

1. **Stored flag is only dropped on the picker path.** Copy day / copy week / site-day copy ([useCopy.ts](src/components/board/hooks/useCopy.ts) never touches `setCollapsedRows`) and split leave the flag in localStorage: the row opens while occupied, but the moment it empties (someone sent back to pool) it snaps shut — the exact behaviour the commit message says it prevents. Fix: replace the special case in `assignToSite` with one effect in BoardClient — `useEffect`: for every `id` in `collapsedRows`, if `projectHasAssignments(id)` then delete it (keyed on `assignmentsState`). One place, every path.
2. **On-hold rows can hide people.** The on-hold section ([BoardClient.tsx:1164–1200](src/components/board/BoardClient.tsx#L1164)) renders no cells, ever, and the guard does not apply to it. The board's own hold path clears assignments ([`handleConfirmHold`](src/components/board/BoardClient.tsx#L676)) — but only for the *selected* week — while `bulkUpdateSites` ([sites.ts:252](src/server/actions/sites.ts#L252)) and the admin `SiteStatusPanel` → `setSiteTransition` record `on_hold` without clearing anything. Employees assigned to such a site (that week, or any later week) are removed from the pool by the rebuild (they are assigned) and have no cell to appear in: invisible, same bug class. Fix on the board: render the on-hold row *with* cells (same `renderCell`, dimmed via the existing `opacity-50` treatment, drops disabled like a public holiday) whenever `projectHasAssignments(project.id)`; keep it as the bare collapsed header when empty. Add a count badge to the collapsed header ("3 assigned") as a minimum if the full row is out of scope. Do not "fix" it server-side by clearing future weeks on every hold transition — that destroys planning data silently.
3. **No test covers the guard.** Add to [BoardClient.test.tsx](test/components/BoardClient.test.tsx) (localStorage works in jsdom; the `projectCell()` helper returns `null` when a row is collapsed):
   - seed `localStorage["gridspatch:collapsed-rows"] = '["p1"]'`, render with an assignment for p1 → cells rendered, chevron `disabled`, title `cannotCollapse`;
   - seed collapsed, no assignments → `projectCell("p1", "Monday")` is null; assign Alice via the site picker → cells appear; send Alice back to pool → cells still present and the stored flag no longer contains `p1` (covers gap 1);
   - after gap 2: project with `weekStatusMap: { p1: "on_hold" }` and an assignment → the employee is rendered somewhere on the board.

Cosmetic, fold in while there:

- The site-name button ([BoardClient.tsx:1129](src/components/board/BoardClient.tsx#L1129)) is not `disabled` (only its `onClick` is guarded) and keeps its hover style, so it still looks clickable on occupied rows — mirror the chevron.
- The default-collapse seed in [useBoardState.ts:287](src/components/board/hooks/useBoardState.ts#L287) reads the stale `Project.status` column instead of `weekStatusMap`. Harmless today (on-hold rows don't use the toggle), but it becomes wrong once gap 2 gives on-hold rows a real collapse state — switch it to the effective status.
- `isPlanned` dimming ([BoardClient.tsx:1109](src/components/board/BoardClient.tsx#L1109)) is unreachable (see the default-status item); delete it or leave a comment saying why it stays.

Acceptance criteria:

- Collapse an empty row; copy a day onto it from the header popover; move the copied person back to the pool: the row stays open.
- Put a site on hold from the admin bulk bar while it has people on it for next week; open next week on the board: those people are visible, and not duplicated in the pool.
- The three component tests above pass; `npm run check` and `npm run test` pass.

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
