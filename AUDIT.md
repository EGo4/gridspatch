# Code Audit — open items

Findings from a read-through of the codebase on 2026-07-31. Nothing here is fixed yet.
Ordered by "fix this first": security, then type safety, then structure, then coverage.

Feature work lives in [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md) — this file is about the existing code, not new functionality.

Suggested order: **0 → 3 → 2 → 4 → 1 → 5** (5 strictly last — see its ordering constraint).

---

## 0. Authorization gaps

The codebase already has a good pattern — it just isn't applied everywhere. [comments.ts](src/server/actions/comments.ts), [settings.ts](src/server/actions/settings.ts) and [users.ts](src/server/actions/users.ts) all resolve the session and check the role before touching data. The files below simply skip it.

### 0a. Two admin pages have no guard

`requireAdminPage()` is called in [admin/audit/page.tsx](src/app/admin/audit/page.tsx), [admin/settings/page.tsx](src/app/admin/settings/page.tsx) and [admin/users/page.tsx](src/app/admin/users/page.tsx).

It is **missing** in:

- [admin/employees/page.tsx](src/app/admin/employees/page.tsx)
- [admin/sites/page.tsx](src/app/admin/sites/page.tsx)

[Sidebar.tsx:140](src/components/Sidebar.tsx#L140) hides the admin nav for non-admins, but that is presentation only. Any authenticated `hr` or `construction_manager` who types the URL gets the full employee and site management UI.

**Fix:** add `await requireAdminPage()` at the top of both page components, matching the three pages that already do it.

### 0b. Three server-action modules have no session or role check at all

- [board.ts](src/server/actions/board.ts) — every board mutation
- [employees.ts](src/server/actions/employees.ts) — employee CRUD, bulk import
- [sites.ts](src/server/actions/sites.ts) — site CRUD, bulk import

[middleware.ts](src/middleware.ts) proves only that *a* session exists; it does not know which role. Server actions are POST endpoints, so page guards do not protect them — these are callable directly by any logged-in user of any role.

**Fix:** decide the intended policy per module first, since it is not obvious from the code:

- board mutations — presumably any authenticated planner (`construction_manager` and up)?
- employee/site CRUD — presumably admin only
- bulk import — admin only

Then add the check the same way `settings.ts` does it (`getSession` → `isAdmin` → `throw`), or add a small `requireRole()` helper next to `requireAdminPage()` in [roles.ts](src/server/better-auth/roles.ts) so the policy lives in one place. Note `hr` exists as a role and its intended permissions are currently undocumented — worth writing down while doing this.

### 0c. Upload routes allow stored XSS

[api/upload/employees/route.ts](src/app/api/upload/employees/route.ts) and [api/upload/users/route.ts](src/app/api/upload/users/route.ts):

```ts
const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
const filename = `${randomUUID()}.${ext}`;
```

Three problems:

1. **No auth check in the route itself.** The only thing between the internet and these writes is the middleware session gate; any authenticated user of any role can write files into `public/`. (And if item 5 is ever done first, nothing is.)
2. **The extension comes from the user-supplied filename**, while the only validation is on `file.type` — a client-set header, trivially forged.
3. **No content sniffing** — the bytes are never checked against the claimed type.

So a POST with a forged `Content-Type: image/png` and a filename of `payload.html` writes `public/uploads/employees/<uuid>.html` (same with `.svg`). And the middleware matcher **explicitly excludes `uploads/`** — the planted file is served from the app's own origin *without any session*. That is stored XSS against every user of the app, including admins, reachable by unauthenticated visitors once planted.

**Fix:**

- Require a session (and the same role as the CRUD action that consumes the upload).
- Derive the extension from the *validated MIME type* via a fixed map, never from `file.name`.
- Verify magic bytes match the claimed type before writing.
- Consider dropping `image/gif` if only avatars are needed (`image/svg+xml` is already not in `ALLOWED_TYPES` — keep it that way).
- Optionally serve uploads from a route that forces `Content-Disposition: attachment` / a strict `Content-Type`, so a stray file can never execute.

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

## 3. BoardClient.tsx is 2471 lines

[BoardClient.tsx](src/components/board/BoardClient.tsx) holds drag-and-drop, copy day, copy week, availability, holidays, comments, filters, the site picker, the mutation queue wiring and roughly fifteen inline modals in a single component.

Three roadmap features — half-day absences, both day-copy variants, and "back to pool" — all land in exactly this file. Splitting it afterwards will be strictly harder.

**Fix:** extract along the seams that already exist in the code's own comment banners:

- `useBoardState` — the assignment state map, the DB→state rebuild effect, the `syncPendingRef` skip logic
- `useAvailability` — sick/vacation marking and clearing
- `useCopy` — day copy, week copy, and their confirmation state
- `useHolidays`
- one component per modal (copy week, day copy confirm, comments, site picker, filter panel)

Droppable-id helpers and the day-part parsing should move to a small `boardIds.ts` so they can be unit-tested without React.

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
