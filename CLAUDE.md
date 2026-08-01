# Gridspatch — Claude Context

## What This Project Is

Weekly construction staffing board. Employees are dragged onto construction sites (`Project`) across Mon–Fri. Assignments track `date`, `dayPart` (full_day / pre_lunch / after_lunch), `employeeId`, `projectId`, and `weekId`.

Beyond the board there is: an admin area (sites, employees, users, company settings, audit log), a statistics page, an hours-worked export, and per-user preferences (theme, accent colours, UI scale, locale).

Planned work lives in [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md) — check it before proposing new features; it holds the agreed specs.

## Stack

- **Framework**: Next.js 15 (App Router, Turbopack dev)
- **Language**: TypeScript 5.8 (strict)
- **Database**: PostgreSQL via Prisma 6
- **Auth**: Better Auth 1.3 (enforced — see below)
- **UI**: React 19, Tailwind CSS 4, @hello-pangea/dnd (drag-and-drop)
- **i18n**: next-intl (en / de)
- **Validation**: Zod

## Key Scripts

```bash
npm run dev          # start dev server (Turbopack)
npm run check        # lint + typecheck — run this before calling work done
npm run typecheck    # tsc --noEmit only
npm run test         # runs every test/*.test.ts via node --experimental-strip-types, then test:components
npm run test:components         # vitest run — component tests under test/components/*.test.tsx (jsdom + RTL)
npm run test:components:watch   # same, in watch mode
npm run db:seed      # re-seed after a reset
npm run db:studio    # Prisma Studio

npx prisma migrate dev --name <description>   # schema change → new migration
npx prisma migrate reset                       # reset dev DB (drops data)
```

## File Structure

```
src/
  app/
    board/page.tsx           # main board page
    stats/                   # statistics page
    export/                  # hours-worked export UI
    profile/                 # user preferences (theme, colors, locale, scale)
    login/
    admin/                   # sites | employees | users | settings | audit
    api/
      auth/[...all]/         # Better Auth route
      export/route.ts        # export file download
      upload/                # employee/user image upload (POST, writes to data/uploads/)
      files/                 # employee/user image serving (GET, authenticated, from data/uploads/)
  components/
    board/BoardClient.tsx    # drag-and-drop board composition + orchestration (~1.5k lines)
    board/hooks/             # useHolidays, useAvailability, useCopy, useBoardState — see below
    board/modals/            # one component per dialog/confirmation (comments, site picker,
                             #   copy day/week, filter, hold/complete/past-week confirmations)
    board/StatusChip.tsx     # status pill + transition popover (shared by two swimlane types)
    board/DayHeaderCell.tsx  # per-day header cell: label, holiday badge, copy/holiday popovers
    board/EmployeeCard.tsx   # card + fly-out action buttons
    board/boardIds.ts        # droppable/draggable id encode + parse (pure, tested)
    board/mutationQueue.ts   # optimistic mutation queue with retry/backoff
    Sidebar.tsx, Logo.tsx, icons.tsx
  server/
    actions/                 # server actions: board, sites, employees, users,
                             #   comments, settings, preferences, locale, errors
    services/                # data-fetching + pure logic: board, export, statistics
    better-auth/             # config, server/client, roles + page guards
    db.ts                    # Prisma singleton + audit-log extension
  i18n/                      # locale config + next-intl request config
  lib/                       # constants.ts (DAYS), week.ts (week date utils),
                             #   imageUpload.ts (MIME/magic-byte validation, upload storage)
  middleware.ts              # session gate for all non-public routes
  styles/globals.css         # theme CSS variables
  types/index.ts             # shared domain types + project status rules
  env.js                     # validated env vars (@t3-oss/env-nextjs)
messages/en.json, messages/de.json   # all UI strings
prisma/schema.prisma, prisma/seed.ts
test/                        # node --experimental-strip-types tests
scripts/create-admin.ts
```

## Database Schema

Auth (Better Auth): `User`, `Session`, `Account`, `Verification`.

Domain:

- **Employee**: name, initials, img?, role?, startDate?, endDate?
- **Project** (a construction site): name, description?, startDate?, endDate?, status, constructionManagerId?
  - status: `planned | active | on_hold | done | inactive` — allowed transitions are encoded in `ALLOWED_TRANSITIONS` in [types/index.ts](src/types/index.ts); super-statuses (`preparation | ongoing | completed`) come from `getSuperStatus`.
  - `startDate`/`endDate` are display-only and slated for removal (see roadmap).
- **ProjectStatusTransition**: status changes recorded per `weekStartDate`, so the board can show a site's status as of the displayed week.
- **Week**: startDate (unique), endDate, isCurrent
- **Assignment**: unique `[employeeId, date, dayPart]`, plus weekId and optional projectId
- **Availability**: unique `[employeeId, date]`, status `sick | vacation` — absence removes that day's assignments
- **EmployeeDayComment**: per employee/date notes with author
- **Holiday**: unique date, `public_holiday | company_holiday`
- **CompanySettings**: singleton row (id `"singleton"`), `hoursPerDay`
- **UserPreference**: accentColor, amColor, pmColor, uiScale, theme, locale
- **AuditLog**: every domain write (see below)

## Conventions That Matter

**Use `db`/`prismaRaw` directly — no hand-written type shims.** The generated client used to lag behind migrations, which is why `db as unknown as SomeDb` casts spread through the codebase; the generated client now covers every model and this pattern is gone (`grep -rn "as unknown as" src` should only ever find the single `globalForPrisma` singleton cast in [db.ts](src/server/db.ts), which is the standard Next.js/Prisma hot-reload pattern, not this issue). If you find yourself reaching for `as unknown as` to call a Prisma method, that almost certainly means the shape you're passing doesn't match the real schema — fix the call, don't paper over it with a narrower hand-written type. The exception that *is* legitimate: [export.ts](src/server/services/export.ts)'s `ExportDb` (and `services/board.ts`'s `BoardDb`, `services/statistics.ts`'s `StatsDb`) are narrow parameter types a service function *accepts as an argument* so it stays testable with a fake client — `db` itself is passed with no cast at all, since it already structurally satisfies them. That pattern is about testability, not about working around the client; don't confuse the two.

**Server actions can't take a Prisma client as a parameter.** Every exported function in a `"use server"` file is called from client components via RPC, so its arguments must be serializable — a Prisma client instance can't cross that boundary. This is why the `BoardDb`/`ExportDb`-style injectable-client pattern above can't apply directly to files like [board.ts](src/server/actions/board.ts). Where a server action's mutation logic needs to be unit-testable, the shape is: extract the DB-touching logic into a plain (non-`"use server"`) module that takes an injectable client, the same way `services/export.ts` is structured, and have the thin `"use server"` action wrapper call it with the real `db`. [board.ts](src/server/actions/board.ts) itself follows this now — the actual assignment/availability/holiday logic lives in [services/boardMutations.ts](src/server/services/boardMutations.ts) (`BoardMutationDb`), covered by [test/board-mutations.test.ts](test/board-mutations.test.ts); `board.ts`'s exports are thin wrappers that just forward to it with the real `db`.

**Audit logging is automatic.** `db` is a `$extends`-wrapped client that writes an `AuditLog` row for every write operation on every model except `AuditLog`/`Session`/`Account`/`Verification`. Use `prismaRaw` only when you deliberately need to bypass that.

**Auth: middleware is optimistic, not authoritative.** [middleware.ts](src/middleware.ts) only checks whether a session *cookie is present* (`getSessionCookie()` from `better-auth/cookies` — no DB lookup, no HTTP round-trip) and redirects to `/login` if not (public: `/login`, `/api/auth`). A forged cookie value passes this check. Real verification happens at the page/action layer, which is why every page component that reads the DB and every mutating action must call a guard itself — middleware existing is not sufficient reasoning to skip one. User roles are `construction_manager | hr | admin`.

**Who may do what.** Despite the `/admin/` URL prefix, **employees and sites are not admin-only** — [Sidebar.tsx](src/components/Sidebar.tsx) lists `/admin/employees` and `/admin/sites` in `baseItems`, visible to every authenticated role, alongside `/board`, `/stats` and `/export`. Only `/admin/users`, `/admin/audit` and `/admin/settings` are admin-gated (`adminItems`). Do not "fix" the employees/sites pages by adding `requireAdminPage()` — that locks `hr` and `construction_manager` out of their actual job. Use `requireSessionPage()` there instead (see below).

Guards in [roles.ts](src/server/better-auth/roles.ts): `requireAdminPage()` and `requireSessionPage()` redirect (use in page components — to `/board` and `/login` respectively), `requireAdmin()` and `requireSession()` throw (use in actions/routes). Every page component that queries the DB directly needs one of the two page guards, even ones with no role restriction — `requireSessionPage()` exists specifically for that "any authenticated role, but still real" case. Convention for actions: mutating ones get a guard, read-only ones do not — see `settings.ts`, where `getCompanySettings` is open and `updateCompanySettings` is gated. That convention predates the middleware change above and still holds, because the *page* that calls a read-only action is what's now required to check `requireSessionPage()`/`requireAdminPage()` itself.

**Every export in a `"use server"` file is its own POST endpoint, independent of which page imports it.** A page-level guard (`requireAdminPage()`) only protects rendering that page — it does nothing for the action itself, which stays callable directly by anyone with a session, regardless of role. Two real bugs found this way and fixed: `updateUser` in [users.ts](src/server/actions/users.ts) took a client-supplied `role` field and wrote it via Prisma with no guard at all — any authenticated user could grant themselves admin. `listUsers` in the same file returned every user's name/email/role/image with no guard, reachable by any role even though only the admin-gated `/admin/users` page ever calls it from the UI. Both now call `requireAdmin()`. When adding a new exported action, ask "what happens if this is called directly, bypassing the page it's meant to be used from" — the page guard is not the enforcement point.

**[board.ts](src/server/actions/board.ts) calls `requireSession()` on every export — this is new, and it is now the actual authentication, not defense-in-depth.** It used to rely on middleware alone (`getSession()` is `React.cache()`-wrapped, which only dedupes within a single request, and each server-action call is its own request — so this was always a full extra check, not a free one). That tradeoff was deliberate right up until middleware itself stopped doing a real check (see above): once middleware only confirms a cookie exists, `board.ts` had no real authentication left at all, since it has no page to lean on either. If you're touching board.ts, keep the guard — do not remove it as an optimization.

**A page component that queries the DB directly and forgets its guard is now a live vulnerability, not a redundancy.** This bit us for real: `board/page.tsx`, `admin/employees/page.tsx`, `admin/sites/page.tsx`, `stats/page.tsx`, and `export/page.tsx` all fetched data with zero guard of their own, on the assumption that middleware already covered it. The middleware change above turned that assumption false — verified with a forged `better-auth.session_token` cookie value, which passed middleware and would have rendered full board/employee/site/stats/export data before the fix. All five now call `requireSessionPage()` first. `admin/audit`, `admin/settings`, `admin/users` were already fine (`requireAdminPage()`); `profile/page.tsx` was already fine (inline `getSession()` + redirect). When adding a new page under `src/app/`, if it reads the DB and isn't `/login`, it needs `requireSessionPage()` or `requireAdminPage()` as its first line — no exceptions on the theory that middleware already handles it.

**Every action parses its input with Zod, at the top of the function, before touching the DB.** Shared primitives (`zId`, `zDateIso`, `zDateParam`, `zDayPart`, `zHolidayType`, `zHexColor`, …) live in [validation.ts](src/server/validation.ts); each action composes its own schema from them inline rather than a page-level type checking it for you — a server action is a plain HTTP endpoint once compiled, so a hand-crafted POST can send anything regardless of what the TypeScript param types say. `board.ts` validates on every call despite having no auth guard (see above) — input hygiene and authentication are separate concerns; Zod is not a substitute for `requireSession()`. The concrete bug this closed: [preferences.ts](src/server/actions/preferences.ts)'s `accentColor`/`amColor`/`pmColor` are spliced into a `<style>` tag via `dangerouslySetInnerHTML` in [layout.tsx](src/app/layout.tsx) on every page load — unvalidated, that was a stored CSS/markup injection into the saving user's own session on every future visit. `zHexColor` now locks them to the exact `#rrggbb` shape `<input type="color">` can ever produce. Dates go through `zDateIso`/`zDateParam` rather than a bare `new Date(input)`, so a malformed string is rejected here instead of becoming an `Invalid Date` that Prisma has to deal with.

**Uploaded avatars are not static files.** Both employee and user avatar uploads go through `POST /api/upload/{employees,users}`, land in `data/uploads/{employees,users}/` (outside `public/`, see `uploadDir()` in [imageUpload.ts](src/lib/imageUpload.ts)), and are served back through `GET /api/files/{employees,users}/[filename]` — a real route handler, not a static path, so it requires a session and sets `Content-Type` from a fixed extension map rather than trusting the file. `requireSession()` guards both kinds (not `requireAdmin()` for users — `/profile` lets every role upload their *own* avatar through the same endpoint; per-target authorization happens downstream in `updateCurrentUser` vs. `updateUser`, not at the upload/serve layer). `isValidUploadFilename()` is the path-traversal guard on the way back out — a served filename must match the exact `${randomUUID()}.${ext}` shape or it's rejected before touching the filesystem. In Docker, this directory is a mounted volume (`uploads_data` in [docker-compose.yml](docker-compose.yml)) so avatars survive a redeploy; locally it's gitignored under `/data/uploads/`.

**No hardcoded UI strings.** Everything user-visible goes through next-intl. Add keys to **both** `messages/en.json` and `messages/de.json` under the right namespace (`Common, Status, Nav, Login, Employees, Sites, Users, Stats, Board, Audit, Export, Settings, Profile, Metadata`). Same for locale-dependent formatting — pass the locale explicitly, never rely on the runtime default.

**No hardcoded colours.** Use the CSS variables in [globals.css](src/styles/globals.css) (`--color-*`, `--am-*`, `--pm-*`, accent). Both `[data-theme="dark"]` (default) and `[data-theme="light"]` must stay consistent when a variable is added.

**Board mutations are optimistic and queued.** `BoardClient` updates local state first, then `enqueue("label", () => serverAction(...))` through [mutationQueue.ts](src/components/board/mutationQueue.ts), which retries with backoff. Do not call board server actions directly from UI handlers. The state-rebuild effect deliberately skips while mutations are in flight (`syncPendingRef`) so optimistic state is not clobbered by stale server props.

**Board cell ids.** All in [boardIds.ts](src/components/board/boardIds.ts): droppable ids are built by `fullDayDroppableId(projectId, day)` / `preLunchDroppableId` / `afterLunchDroppableId` / `poolFullDayId(day)`, and parsed back with `getProjectIdFromDroppableId` / `getDayPartFromDroppableId`. Never hand-assemble these strings. That module imports by relative path (not the `~/` alias) so the tests can load it under `node --experimental-strip-types`.

**Past-week edits** go through `confirmPastEdit(...)`, which asks the user before mutating a week that has already passed.

**Component tests run on a second, separate test runner.** The `test/*.test.ts` files loaded by `node --experimental-strip-types` (pure logic, no DOM) can't render React components — there's no JSX transform and no `document`. `test/components/*.test.tsx` files instead run under Vitest + jsdom + React Testing Library (`vitest.config.ts`, setup in `test/components/setup.ts`), wired in as `npm run test:components` and chained onto the end of `npm run test`. Keep pure-logic tests in `test/*.test.ts` and component tests in `test/components/*.test.tsx` — don't move one runner's tests into the other's directory. Things that bit us setting this up, worth knowing before adding more:

- `@hello-pangea/dnd` renders its drag attributes as `data-rfd-*` (its own fork prefix), not `data-rbd-*` — query droppables/draggables in tests via `[data-rfd-droppable-id="..."]` / `[data-rfd-draggable-id="..."]`.
- Vitest has no Jest-style auto-registration for React Testing Library's cleanup; without `afterEach(cleanup)` in `setup.ts`, every `render()` in a file leaves its tree in `document.body` and a later `document.querySelector` in the same file can silently match a *previous* test's stale, empty element instead of the current render's.
- CSS classes that hide inactive days (`hidden`, `lg:flex`) do nothing in jsdom — no stylesheet is loaded — so every day column and every unassigned employee's pool card across all five days are simultaneously present in the DOM. Scope queries to one day/cell's container (via its `data-rfd-droppable-id`) rather than querying by employee name alone.
- Fixture weeks must resolve to a date **after** the real system clock, not just after some fictional "today" — `confirmPastEdit()` compares `selectedWeek.startDateIso` against `getCurrentWeekStart()`, which calls real `new Date()`. A fixture dated in the actual past silently routes every mutation through the past-week confirmation modal instead of running it, and the test just sees nothing happen.

## DB Connection

PostgreSQL runs in WSL; Prisma connects via `localhost:5432` from Windows. Docker Compose + Caddy configs live in the repo root for deployment.

**The runtime image has no global npm/npx/corepack.** [Dockerfile](Dockerfile)'s `runner` stage deliberately deletes them — every CVE a container scan turns up on this image lives inside npm's own bundled dependency tree (baked into `node:20-alpine`, not ours or Alpine's), and the container never invokes global npm: [docker-entrypoint.sh](docker-entrypoint.sh) only runs local `node_modules/.bin/{prisma,next}`. If a future change needs the global `npm`/`npx` binary inside the running container, that's a sign something is being done at runtime that should happen at build time instead — don't just re-add the binaries back.

## Compaction Instructions

When compacting, always preserve:
- The list of files modified in this session
- Any pending migration names or schema changes
- Current feature being implemented
