# Code Audit — open items

Findings from a read-through of the codebase on 2026-07-31, last revised 2026-08-01.
Resolved items are deleted from this file once verified — git history and [CLAUDE.md](CLAUDE.md) hold the reasoning worth keeping. What is written below is what is still **open**.

Feature work lives in [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md) — this file is about the existing code, not new functionality.

## Where to start

No open items. The three findings from the 2026-07-31 read-through (splitting BoardClient.tsx, Zod validation, the middleware round-trip) are all resolved — see [CLAUDE.md](CLAUDE.md) for the reasoning worth keeping, and git history for the detail.

The middleware item's fix turned up more than its own description covered: trimming `middleware.ts` down to an optimistic cookie-presence check meant every page component that queries the DB directly needed its own real guard, not just the two spots (`board.ts`, `api/export/route.ts`) originally flagged. Five page components (`board`, `admin/employees`, `admin/sites`, `stats`, `export`) had none and were verified — with a forged session cookie — to leak their data before the fix. See the "page component that queries the DB directly" note in [CLAUDE.md](CLAUDE.md) before adding a new page.
