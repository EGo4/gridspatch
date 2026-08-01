# Code Audit — open items

Findings from a read-through of the codebase on 2026-07-31, last revised 2026-08-01.
Resolved items are deleted from this file once verified — git history and [CLAUDE.md](CLAUDE.md) hold the reasoning worth keeping. What is written below is what is still **open**.

Feature work lives in [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md) — this file is about the existing code, not new functionality.

## Where to start

Items are listed in the order they should be done. The order is not arbitrary — items 2 and 3 have a hard dependency, item 5 has a safety constraint that requires items 1 and 4 to land first.

| # | Item | Size | Why here |
| --- | --- | --- | --- |
| 1 | [Drop the obsolete Prisma shims](#1-the-as-unknown-as-prisma-shims-are-obsolete) | M | Highest safety-per-hour; makes item 2 possible |
| 2 | [Server-action invariant tests](#2-no-tests-cover-assignment-invariants) | M | Needs item 1 for injectable `db` |
| 3 | [Finish splitting BoardClient.tsx](#3-boardclienttsx-is-2434-lines) | L | Do before the roadmap's board features land here |
| 4 | [Validate action input with Zod](#4-zod-is-a-declared-dependency-that-is-never-used) | M | Also closes the export-route auth gap noted in item 5 |
| 5 | [Trim the middleware round-trip](#5-middleware-does-an-http-round-trip-on-every-request) | S | **Strictly last** — see its ordering constraint |

---

## 1. The `as unknown as` Prisma shims are obsolete

32 occurrences across `src/`, 14 of them in [board.ts](src/server/actions/board.ts) alone.

The pattern exists because the generated client used to lag behind migrations. It no longer does — the generated client exposes every model:

```text
user, session, account, verification, employee, project, projectStatusTransition,
week, assignment, availability, employeeDayComment, holiday, companySettings,
userPreference, auditLog
```

The casts now actively cost safety. For example [board.ts](src/server/actions/board.ts) declares:

```ts
deleteMany: (args: { where: unknown }) => Promise<unknown>;
```

so a misspelled or restructured `where` clause compiles cleanly and only fails at runtime (`PrismaClientValidationError`) — in the file that performs nearly every destructive board mutation. With real types the compiler catches it.

**Fix:** delete the hand-written `*Db` types and use `db` directly, file by file, running `npm run typecheck` after each. Expect the compiler to surface a handful of genuine mismatches; that is the point.

**While you are in there — do this for item 2:** have the board actions take the Prisma client as a parameter instead of reaching for the module-level `db`, the way [export.ts](src/server/services/export.ts) already does with its `ExportDb` type. That is what makes item 2's tests possible, and it is much cheaper to do in the same pass than as a second edit of the same functions.

**Afterwards:** update the "Prisma type shims" convention in [CLAUDE.md](CLAUDE.md), which currently documents the casts as intentional.

---

## 2. No tests cover assignment invariants

Current suite: [week-planning.test.ts](test/week-planning.test.ts), [export.test.ts](test/export.test.ts), [board-ids.test.ts](test/board-ids.test.ts), [image-upload.test.ts](test/image-upload.test.ts) — pure date, aggregation, ID-encoding and upload-validation logic. None of it touches the mutation logic where the real complexity lives.

**Depends on item 1** having made the board actions accept an injectable client.

Worth covering, roughly in this order:

- split → merge round-trips back to a single `full_day` row
- marking an absence clears exactly that day's assignments and no more
- copy day / copy week when the target day already has assignments
- the `[employeeId, date, dayPart]` unique-constraint conflict during a partial copy — specced in [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md) under "Site-selective day copy"; write this test *before* building that feature

Follow the existing style: a fake `db` object literal typed to the action's parameter, `node --experimental-strip-types`, and a new line in the `test` script in `package.json`.

---

## 3. BoardClient.tsx is 2434 lines

[BoardClient.tsx](src/components/board/BoardClient.tsx) holds drag-and-drop, copy day, copy week, availability, holidays, comments, filters, the site picker, the mutation queue wiring and roughly fifteen inline modals in one component.

Three roadmap features — half-day absences, both day-copy variants, and "back to pool" — all land in exactly this file. Splitting it afterwards will be strictly harder.

The ID helpers are already out (see [boardIds.ts](src/components/board/boardIds.ts)). What remains is the hard part: `useBoardState` (the assignment map, the DB→state rebuild effect, the `syncPendingRef` skip logic), `useAvailability`, `useCopy`, `useHolidays`, and one component per modal.

**Read this before starting.** `assignmentsState` is touched by nearly every handler — `assignToSite`, `markAvailability`, `clearAvailability`, `copyDay`, `splitDay`, `mergeDay`, `onDragEnd`, `applyHoliday` — all closing over `dbEmployees` / `dbProjects` / `selectedWeek` / `enqueue` / `confirmPastEdit` / `weekDates`. On top of that sit `syncPendingRef` and `skippedRebuildRef`, which exist specifically to stop a rebuild from stale server props clobbering optimistic state that has not reached the DB yet. A slipped effect dependency or a closure captured at the wrong moment surfaces as "my drag silently reverted", days later, in production.

**On the safety net — be realistic:** item 2's tests cover the *server actions*, not this client-side state machine. The project has no component-test infrastructure at all (no jsdom, no Testing Library, no runner beyond `node --experimental-strip-types`), so there is no automated net for this refactor unless you add one. Your two honest options are (a) stand up a component-test setup first, or (b) budget deliberate manual QA afterwards covering every board interaction: drag between cells and days, split, merge, copy day, copy previous week, sick/vacation, both holiday types, status transitions, and the past-week confirmation path — each with the sync badge watched to confirm the queue drains. Do not do this one in a hurry.

---

## 4. Zod is a declared dependency that is never used

`zod` is in `package.json` and listed in the stack, but the only import in the whole tree is [env.js](src/env.js). Every server action takes raw client input and hands it to Prisma unvalidated:

- date strings go through `new Date(input.startDate)` with no check, so `Invalid Date` can reach the DB layer
- strings have no length or shape constraints
- the bulk-import paths (`bulkCreateEmployees`, `bulkCreateSites`, `bulkUpdateSites`) accept arbitrary parsed JSON with only ad-hoc `typeof` checks

**Fix:** define one schema per action input, parse at the top of the action, let the parsed value flow onward. Start with the bulk-import paths — they take the least trustworthy input.

**Also fix here:** [api/export/route.ts](src/app/api/export/route.ts) has **no session check of its own** — middleware is its only auth, the same pattern the upload/serve routes had before they were fixed (see the guard note in [CLAUDE.md](CLAUDE.md)). Add `requireSession()` from [roles.ts](src/server/better-auth/roles.ts) while you are adding validation to its query-parameter parsing. Item 5 cannot safely land until this is done.

**While you're touching every action for validation, do one more pass for the class of bug already found twice in this codebase** (see the "`use server`" note in [CLAUDE.md](CLAUDE.md)): every exported function in a `"use server"` file is independently callable, regardless of which page imports it or what that page's guard checks. Skim every action module for one that assumes a page-level guard protects it and doesn't check for itself.

Until this item is finished, the "Validation: Zod" line in [CLAUDE.md](CLAUDE.md) overstates what the code does.

---

## 5. Middleware does an HTTP round-trip on every request

[middleware.ts](src/middleware.ts) calls `betterFetch("/api/auth/get-session")` against `http://localhost:${PORT}` for every non-static request, so each navigation costs an extra internal HTTP call plus a DB lookup.

Better Auth's recommended shape is an optimistic cookie-presence check in middleware, with real verification at the page/action layer.

**Ordering constraint — this is why the item is last.** A cookie-*presence* check is spoofable: any value passes. Middleware is currently the *only* auth for two things, so weakening it before they are fixed leaves them open to anyone who sets a cookie:

- [api/export/route.ts](src/app/api/export/route.ts) — no check of its own (see item 4)
- [board.ts](src/server/actions/board.ts) — deliberately relies on middleware alone; see the note in [CLAUDE.md](CLAUDE.md). If middleware stops being a real check, that decision must be revisited and `requireSession()` added there after all.

So: item 4 first, then re-decide `board.ts`, then this.

Also note the hardcoded `http://localhost:${PORT}` base URL — worth confirming it behaves under the Docker Compose + Caddy setup in the repo root.
