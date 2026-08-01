# Code Audit — open items

Findings from a read-through of the codebase on 2026-07-31.
Ordered by "fix this first": security, then type safety, then structure, then coverage.
Items get marked RESOLVED in place as they're fixed, rather than deleted — the reasoning (especially where an initial assumption turned out wrong) is worth keeping.

Feature work lives in [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md) — this file is about the existing code, not new functionality.

Suggested order for what's left: **4 → 3 (remainder) → 2 → 1 → 5** (5 strictly last — see its ordering constraint). Item 0 is resolved; item 3 is partially done — see its note on why 4 moved ahead of finishing it.

---

## 0. Authorization gaps — RESOLVED, with a correction

The original write-up of this item assumed employee/site CRUD should be admin-only because it lives under `/admin/`. That assumption was wrong, and led to a wrong initial fix plan — recorded here so it isn't repeated.

**What the evidence actually shows:** [Sidebar.tsx:147-153](src/components/Sidebar.tsx#L147-L153) puts `/admin/employees` and `/admin/sites` in `baseItems`, shown to every authenticated role unconditionally. Only `/admin/users`, `/admin/audit`, `/admin/settings` are gated behind `isAdmin` (`adminItems`, [Sidebar.tsx:155-161](src/components/Sidebar.tsx#L155-L161)). Neither `EmployeesClient.tsx` nor `SitesClient.tsx` has any role check on their edit/create/delete/import UI. So the product's actual design is: **`admin` manages users, audit log and company settings; every authenticated role manages the board, employees and sites.** Adding `requireAdminPage()` to the employees/sites pages, as originally planned, would have locked `hr` and `construction_manager` out of their own job.

**0a — corrected, no fix needed.** The two pages were never missing a guard relative to their intended audience; they were correctly open to all roles, same as `/board`, `/stats`, `/export`. No change made.

**0b — corrected and fixed with a narrower scope than planned.** The original claim that these actions have "no session or role check at all, callable by any logged-in user of any role" was misleading on the role part (there is no role restriction to violate — see above) and overstated on the session part: [middleware.ts](src/middleware.ts)'s matcher (`/((?!_next/static|_next/image|favicon.ico|uploads/).*)`) covers `/board`, `/admin/employees` and `/admin/sites`, and Next.js Server Actions POST to the page that defined them — so these actions were already unreachable without a session, as long as they're only invoked from those protected pages (confirmed: [employees.ts](src/server/actions/employees.ts) is only imported by `EmployeesClient.tsx`, [sites.ts](src/server/actions/sites.ts) only by `SitesClient.tsx`/`BoardClient.tsx`, [board.ts](src/server/actions/board.ts) only by `BoardClient.tsx`).

What was still worth fixing: relying *solely* on middleware for a mutation is fragile defense-in-depth (a future edit to `PUBLIC_PATHS` or the matcher regex silently opens every mutation). Added `requireSession()` to [roles.ts](src/server/better-auth/roles.ts) (throws unless a session exists, deliberately no role check) and called it at the top of every mutating export in [employees.ts](src/server/actions/employees.ts) and [sites.ts](src/server/actions/sites.ts) — `createEmployee`, `updateEmployee`, `deleteEmployee`, `bulkCreateEmployees`, `createSite`, `updateSite`, `deleteSite`, `setSiteTransition`, `bulkCreateSites`, `bulkUpdateSites`, `deleteSiteTransition`. Read-only exports (`getSiteTransitions`) were left ungated, matching the existing convention in `settings.ts` (`getCompanySettings` is open, `updateCompanySettings` is gated).

**[board.ts](src/server/actions/board.ts) deliberately excluded from this fix — confirmed with the maintainer.** `getSession()` is `React.cache()`-wrapped ([server.ts](src/server/better-auth/server.ts)) so it dedupes *within* one request/render, but each server-action call is its own request, and middleware's `getSession` runs via a separate `betterFetch` HTTP round-trip that isn't shared with that cache at all — so adding `requireSession()` here would mean a second, real session lookup on every single drag, split, merge, copy and availability toggle, which is the single highest-frequency interaction in the app. The safety gain is marginal (protects only against a future middleware regression, same as employees/sites). Raised as an explicit choice rather than assumed either way; decision: leave `board.ts` as-is, rely on middleware alone. Revisit only if middleware's own coverage changes (see item 5).

**0c — fixed, this was the one real, confirmed vulnerability.** [api/upload/employees/route.ts](src/app/api/upload/employees/route.ts) and [api/upload/users/route.ts](src/app/api/upload/users/route.ts) derived the written file's extension from the *user-supplied filename* while only validating `file.type` (a client-set, trivially forged header), with no magic-byte check. A POST with a forged `Content-Type: image/png` and filename `payload.html` wrote `public/uploads/employees/<uuid>.html`; the middleware matcher explicitly excludes `uploads/`, so that file was then served same-origin **without any session** — stored XSS reachable by unauthenticated visitors once planted.

Fixed via a shared [imageUpload.ts](src/lib/imageUpload.ts): extension is now derived from a fixed MIME→extension map (never from `file.name`), and file bytes are checked against magic numbers for JPEG/PNG/GIF/WebP before the file is written; anything that doesn't match is rejected. Both routes now also require a session before accepting a file — matching each route's actual consumer: `requireSession()` (any role) for the employees route since employee-avatar upload is reachable from the all-roles employees page, `requireAdmin()` for the users route since it's only reachable from the admin-only users page.

Verified: `npm run typecheck`/`lint`/`test` all clean, and manually smoke-tested (login, employees/sites pages, avatar upload) after the change.

---

## 1. Zod is a declared dependency that is never used

`zod` is in `package.json` and listed in the stack, but the only import in the whole tree is [env.js](src/env.js). Every server action takes raw client input and hands it to Prisma unvalidated:

- date strings go through `new Date(input.startDate)` with no check, so `Invalid Date` can reach the DB layer
- strings have no length or shape constraints
- bulk import paths (`importEmployees`, `importSites`) accept arbitrary parsed JSON with only ad-hoc `typeof` checks

**Fix:** define one schema per action input, parse at the top of the action, and let the parsed value flow onward. Start with the bulk-import paths — they take the least trustworthy input. This pairs naturally with item 0b, since both mean "add a preamble to every action".

Until then, the "Validation: Zod" line in [CLAUDE.md](CLAUDE.md) overstates what the code does.

---

## 2. The `as unknown as` Prisma shims are obsolete

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

**Fix:** delete the hand-written `*Db` types and use `db` directly, file by file, running `npm run typecheck` after each. Expect the compiler to surface a handful of genuine mismatches; that is the point. Afterwards, update the "Prisma type shims" convention in [CLAUDE.md](CLAUDE.md), which currently documents this as intentional.

Highest safety-per-hour item in this file.

---

## 3. BoardClient.tsx is 2471 lines — PARTIALLY ADDRESSED

[BoardClient.tsx](src/components/board/BoardClient.tsx) holds drag-and-drop, copy day, copy week, availability, holidays, comments, filters, the site picker, the mutation queue wiring and roughly fifteen inline modals in a single component.

Three roadmap features — half-day absences, both day-copy variants, and "back to pool" — all land in exactly this file. Splitting it afterwards will be strictly harder.

**Done:** the droppable/draggable-id helpers (`getDraggableId`, `parseFromDraggableId`, `getDayFromDroppableId`, `getProjectIdFromDroppableId`, `getDayPartFromDroppableId`, `fullDayDroppableId`, `preLunchDroppableId`, `afterLunchDroppableId`, `poolFullDayId`) moved to [boardIds.ts](src/components/board/boardIds.ts) — pure functions, zero behavior change, now covered by 7 unit tests / 17 assertions in [board-ids.test.ts](test/board-ids.test.ts) (also chips away at item 4). `BoardClient.tsx` 2471 → 2434 lines. Verified: `typecheck`/`lint`/`test` all clean, same pre-existing lint warnings only.

**Not done, and deliberately not attempted in the same pass:** the state/effect extraction (`useBoardState`, `useAvailability`, `useCopy`, `useHolidays`, one component per modal). This is a materially different risk profile from the ID-helper move — `assignmentsState` is touched by nearly every handler (`assignToSite`, `markAvailability`, `clearAvailability`, `copyDay`, `splitDay`, `mergeDay`, `onDragEnd`, `applyHoliday`), all closing over `dbEmployees`/`dbProjects`/`selectedWeek`/`enqueue`/`confirmPastEdit`/`weekDates`, plus the ref-based `syncPendingRef`/`skippedRebuildRef` skip logic that exists specifically to avoid clobbering in-flight optimistic state. A slip in an effect dependency array or a closure captured before extraction is the kind of bug that only shows up as "my drag silently reverted" days later — and item 4 (test coverage) is still open, so there's no automated safety net for exactly the behavior this refactor would touch. Splitting this without either a human doing careful manual QA of every board interaction (drag, split, merge, both copy paths, sick/vacation, holidays, status transitions) or test coverage in place first is the kind of high-blast-radius change worth pausing on rather than pushing through solo.

**Recommendation:** do item 4's invariant tests (split/merge round-trip, absence-clears-assignment, copy-day conflict handling) against the current `BoardClient.tsx` first, *then* extract the hooks behind that net — the tests won't need to change since they're testing behavior, not structure. This reorders the suggested sequence below.

---

## 4. Test coverage is thin

Two test files, [test/week-planning.test.ts](test/week-planning.test.ts) and [test/export.test.ts](test/export.test.ts), both covering pure date/aggregation logic. Nothing covers assignment invariants, which is where the actual complexity lives:

- split → merge round-trips back to a single `full_day` row
- marking an absence clears exactly that day's assignments and no more
- copy day / copy week behaviour when the target already has data
- the `[employeeId, date, dayPart]` unique-constraint conflict during a partial copy (specced in the roadmap — worth writing the test before the feature)

The board actions are hard to test today because they reach for the module-level `db`. Item 2 makes them typed; taking the client as a parameter — the way [export.ts](src/server/services/export.ts) already does with `ExportDb` — would make them testable.

---

## 5. Middleware does an HTTP round-trip on every request

[middleware.ts](src/middleware.ts) calls `betterFetch("/api/auth/get-session")` against `http://localhost:${PORT}` for every non-static request, meaning each navigation costs an extra internal HTTP call plus a DB lookup.

Better Auth's recommended shape is an optimistic cookie-presence check in middleware, with real verification at the page/action layer.

**Ordering constraint:** a cookie-*presence* check is spoofable (any value passes), and today the upload routes (item 0c) and [api/export/route.ts](src/app/api/export/route.ts) have **no verification of their own** — middleware is their only auth. Weakening middleware before 0b and 0c land, plus a session check in the export route, would leave those endpoints effectively open. Do this item last.

Also note the hardcoded `http://localhost:${PORT}` base URL — worth confirming it behaves under the Docker Compose + Caddy setup in the repo root.
