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
