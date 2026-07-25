# Feature Roadmap

This file is meant to be a working checklist for the next product steps.
Order is based on practical relevance: core planning workflow first, security/admin next, and reporting/polish last.

## Comments per employee per day

Goal:
Planners can attach short notes to an employee for a specific date (e.g. "leaves at 14:00", "doctor appointment"). Multiple comments per employee/day, each with author and timestamp.

Requirements:

- Comments are scoped to **employee + date**, not to an assignment — they survive when the employee is moved to another site.
- Multiple comments per day allowed; each stores author (User), text, createdAt.
- Board UI: visual indicator on the employee card when comments exist for that day; click opens a popover/dialog to read and add comments.
- Users can delete their own comments; admins can delete any.

Acceptance criteria:

- Add comment → indicator appears immediately; reload keeps it.
- Moving the employee to another site keeps the comment visible.
- Comment list shows author name and time.

Technical notes:

- **DB change** — new model, e.g.:
  `EmployeeDayComment { id, employeeId → Employee, date @db.Date, authorId → User, text, createdAt }`
  with index on `(employeeId, date)`. New migration required.
- Include comment counts in the board data fetch (`src/server/services/board.ts`) to avoid per-card queries.

## HR user role

Goal:
New user role `hr` for HR/administrative staff. HR users can edit the plan, view statistics, and use the Excel export — but can never be selected as construction manager of a project.

Requirements:

- Add `hr` to the allowed values of `User.role` (alongside `construction_manager`, `admin`).
- HR users are excluded from every construction-manager dropdown (project create/edit, bulk edit).
- HR users have access to: board (full editing), statistics page, export page.
- HR users have **no** access to admin pages (users, sites, audit).
- Enforcement server-side in the relevant actions, not only hidden in the UI.

Acceptance criteria:

- Admin can set a user's role to HR in the user admin.
- HR user does not appear in manager selection lists.
- HR user navigating to `/admin/*` is rejected; board mutations and export succeed.

Technical notes:

- Role check helper next to the Better Auth config in `src/server/better-auth/`, used by server actions and page guards.

## Excel export page (HR / administration)

Goal:
Separate export page (hub for future exports) where HR/admin can download week-based Excel reports of hours worked per employee per construction site.

Requirements:

- New page, e.g. `/export`, accessible to all roles (`hr`, `admin`, `construction_manager`) — construction managers have no restrictions apart from admin-only areas (user management, audit log).
- Time range selection: single week, multiple weeks, a calendar month, or a whole year.
- Only construction sites that actually had assignments in the selected range are included.
- Two switchable layouts:
  - **Employee-driven**: rows = employees, columns = sites (per week), cells = hours worked on that site.
  - **Site-driven**: rows = sites with their assigned employees, mirroring the board layout.
- Hours are derived from assignments: `full_day` = configured hours per day, `pre_lunch`/`after_lunch` = half of that.
- **Hours per full day is a company-wide configurable setting** (default 8) editable by admin.
- Absences are included as two dedicated rows — **sick** and **vacation** — exactly like on the board (in the employee-driven layout as two dedicated columns per week instead).
- Output format: `.xlsx`, one worksheet per week for multi-week/month/year exports.

Acceptance criteria:

- Export for a week lists exactly the sites with ≥1 assignment that week.
- Sums per employee and per site are correct for mixed full/half days.
- Changing the hours-per-day setting changes subsequent exports.
- Month/year export produces one file with one sheet per week.
- Sick/vacation days show up in the sick/vacation rows, not under any site.

Technical notes:

- **DB change** for the setting — either a `CompanySetting` key/value model or a settings table; new migration.
- Generation server-side (route handler streaming the file) with a library such as `exceljs`.
- Aggregation query lives in a new service, e.g. `src/server/services/export.ts`; includes `EmployeeStatus` (sick/vacation) alongside assignments.

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

## Fix translation gaps (hardcoded English strings)

Goal:
All user-visible strings go through the i18n layer (`src/i18n/`, locales `en`/`de`). No hardcoded English text in components.

Requirements:

- Audit all components/pages for hardcoded strings (board, admin pages, stats, export, dialogs, toasts, empty states, aria-labels).
- Move each into the message catalogs with a German translation.
- Establish the rule for new code: no literals, always message keys.

Acceptance criteria:

- Switching to Deutsch shows no English leftovers on any page.
- `en` and `de` catalogs contain the same key set.

## UI polish: pool divider, filter buttons, "done" status color

Goal:
Three small visual improvements for clarity.

Requirements:

- **Pool divider**: the line above the employee pool becomes visually prominent (thicker/higher contrast) so the pool is clearly separated from the board.
- **Bottom-right buttons** (filter, …): larger and more visible — bigger hit area, stronger contrast/shadow so they are discoverable.
- **`done` status color**: `done` gets its own color (violet) everywhere a status is shown — board, admin sites table, status filters, stats — so it is clearly distinct from `active`. Define it once as a shared token/class next to the existing status colors.

Acceptance criteria:

- `done` and `active` are distinguishable at a glance in every status display.
- Filter buttons meet a sensible minimum touch size (~40px) and stand out from the background.
