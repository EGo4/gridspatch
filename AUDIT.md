# Code Audit — open items

Findings from a read-through of the codebase on 2026-07-31, last revised 2026-08-01.
Resolved items are deleted from this file once verified — git history and [CLAUDE.md](CLAUDE.md) hold the reasoning worth keeping. What is written below is what is still **open**.

Feature work lives in [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md) — this file is about the existing code, not new functionality.

## Where to start

Items are listed in the order they should be done. Item 3 has a safety constraint that requires item 2 to land first.

| # | Item | Size | Why here |
| --- | --- | --- | --- |
| 1 | [Finish splitting BoardClient.tsx](#1-boardclienttsx-split-hooks-are-out-modals-remain) | M | Do before the roadmap's board features land here |
| 2 | [Validate action input with Zod](#2-zod-is-a-declared-dependency-that-is-never-used) | M | Also closes the export-route auth gap noted in item 3 |
| 3 | [Trim the middleware round-trip](#3-middleware-does-an-http-round-trip-on-every-request) | S | **Strictly last** — see its ordering constraint |

---

## 1. BoardClient.tsx split: hooks are out, modals remain

[BoardClient.tsx](src/components/board/BoardClient.tsx) held drag-and-drop, copy day, copy week, availability, holidays, comments, filters, the site picker, the mutation queue wiring and roughly fifteen inline modals in one component.

The ID helpers were already out (see [boardIds.ts](src/components/board/boardIds.ts)). The stateful "hard part" is now also out, as four hooks under [src/components/board/hooks/](src/components/board/hooks/):

- `useBoardState` — the assignment map's rebuild effect, `syncPendingRef`/`skippedRebuildRef`, `assignToSite`/`splitDay`/`mergeDay`/`onDragStart`/`onDragEnd`
- `useAvailability` — sick/vacation state, marking and clearing it
- `useCopy` — copy-day and copy-previous-week state and actions, including both overwrite-confirmation modals
- `useHolidays` — public/company holiday state, applying and clearing it

`assignmentsState` itself deliberately stays a plain `useState` in `BoardClient` rather than moving into any one hook — all four hooks read and write it, so it's genuinely shared state, not something one of them owns exclusively. Each hook takes it (and any other hook's setter it needs, e.g. `useBoardState` takes `setAvailability` from `useAvailability`) as a parameter. That's what made extracting all four possible without a circular dependency between them.

**What's left:** one component per modal (roughly fifteen inline modals/popovers — comments dialog, site picker, copy-week/day-copy confirmations, filter modal, hold/complete/past-week confirmations, the holiday and copy popovers). This is more mechanical than the state extraction was — mostly moving JSX and threading props — but still sizable, and still needs the same care: verify with the full test suite after each one, not just at the end.

**Read this before continuing.** Even split across hooks, `assignmentsState` is still touched by nearly every handler, all needing `dbEmployees` / `dbProjects` / `selectedWeek` / `enqueue` / `confirmPastEdit` / `weekDates` threaded in. `syncPendingRef` and `skippedRebuildRef` still exist specifically to stop a rebuild from stale server props clobbering optimistic state that has not reached the DB yet — that logic now lives in `useBoardState`'s rebuild effect exactly as before, just relocated. A slipped effect dependency or a closure captured at the wrong moment still surfaces as "my drag silently reverted", days later, in production.

**Safety net status.** [test/board-mutations.test.ts](test/board-mutations.test.ts) covers the *server-action* mutation logic. A component-test harness also exists now — Vitest + jsdom + React Testing Library, see the "Component tests run on a second, separate test runner" note in [CLAUDE.md](CLAUDE.md) — with [test/components/BoardClient.test.tsx](test/components/BoardClient.test.tsx) (16 tests) covering: initial pool placement, mark-sick removal, split→merge round-trip, the syncPendingRef/skippedRebuildRef rebuild-skip behavior called out above, copy day (both the immediate path and the overwrite-confirmation modal), copy previous week, both holiday types plus clearing one, all three status-transition branches (plain, on-hold-with-confirmation, complete-with-confirmation), the past-week confirmation modal (both the confirm and mute paths), and same-list keyboard-driven reordering.

**What is still not covered, and why it's being left that way rather than forced in:** cross-list drag-and-drop — actually moving a card from one cell/day to another by dragging — could not be made to work in jsdom. `@hello-pangea/dnd`'s keyboard sensor (Space to lift, arrows to move, Space to drop) does work for reordering *within* one droppable, since that's index-based, but moving *between* droppables requires the library to pick a target using real `getBoundingClientRect` layout, which jsdom always reports as zero-sized — the card silently stays put. Closing this gap needs either mocking per-droppable rects with distinct positions (fiddly, likely to rot as layout changes) or a real browser via Playwright/Cypress (a bigger addition, arguably its own audit item). Comments (the dialog, not the count badge) are also still untested — lower risk, ordinary form/list code, but worth a pass. Manual QA of both remains the honest fallback until either is closed.

---

## 2. Zod is a declared dependency that is never used

`zod` is in `package.json` and listed in the stack, but the only import in the whole tree is [env.js](src/env.js). Every server action takes raw client input and hands it to Prisma unvalidated:

- date strings go through `new Date(input.startDate)` with no check, so `Invalid Date` can reach the DB layer
- strings have no length or shape constraints
- the bulk-import paths (`bulkCreateEmployees`, `bulkCreateSites`, `bulkUpdateSites`) accept arbitrary parsed JSON with only ad-hoc `typeof` checks

**Fix:** define one schema per action input, parse at the top of the action, let the parsed value flow onward. Start with the bulk-import paths — they take the least trustworthy input.

**Also fix here:** [api/export/route.ts](src/app/api/export/route.ts) has **no session check of its own** — middleware is its only auth, the same pattern the upload/serve routes had before they were fixed (see the guard note in [CLAUDE.md](CLAUDE.md)). Add `requireSession()` from [roles.ts](src/server/better-auth/roles.ts) while you are adding validation to its query-parameter parsing. Item 3 cannot safely land until this is done.

**While you're touching every action for validation, do one more pass for the class of bug already found twice in this codebase** (see the "`use server`" note in [CLAUDE.md](CLAUDE.md)): every exported function in a `"use server"` file is independently callable, regardless of which page imports it or what that page's guard checks. Skim every action module for one that assumes a page-level guard protects it and doesn't check for itself.

Until this item is finished, the "Validation: Zod" line in [CLAUDE.md](CLAUDE.md) overstates what the code does.

---

## 3. Middleware does an HTTP round-trip on every request

[middleware.ts](src/middleware.ts) calls `betterFetch("/api/auth/get-session")` against `http://localhost:${PORT}` for every non-static request, so each navigation costs an extra internal HTTP call plus a DB lookup.

Better Auth's recommended shape is an optimistic cookie-presence check in middleware, with real verification at the page/action layer.

**Ordering constraint — this is why the item is last.** A cookie-*presence* check is spoofable: any value passes. Middleware is currently the *only* auth for two things, so weakening it before they are fixed leaves them open to anyone who sets a cookie:

- [api/export/route.ts](src/app/api/export/route.ts) — no check of its own (see item 2)
- [board.ts](src/server/actions/board.ts) — deliberately relies on middleware alone; see the note in [CLAUDE.md](CLAUDE.md). If middleware stops being a real check, that decision must be revisited and `requireSession()` added there after all.

So: item 2 first, then re-decide `board.ts`, then this.

Also note the hardcoded `http://localhost:${PORT}` base URL — worth confirming it behaves under the Docker Compose + Caddy setup in the repo root.
