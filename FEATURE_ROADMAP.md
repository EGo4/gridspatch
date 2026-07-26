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
