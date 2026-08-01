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
npm run test         # runs test/week-planning.test.ts + test/export.test.ts
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
    board/BoardClient.tsx    # drag-and-drop board logic (large, ~2.4k lines)
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

**Prisma type shims.** Server code frequently does `db as unknown as SomeDb` with a hand-written type describing just the operations it needs (see [board.ts](src/server/actions/board.ts), [export.ts](src/server/services/export.ts)). This is deliberate — it keeps services testable and works around the generated client lagging behind migrations. Follow the existing pattern in those files rather than reaching for the generated types.

**Audit logging is automatic.** `db` is a `$extends`-wrapped client that writes an `AuditLog` row for every write operation on every model except `AuditLog`/`Session`/`Account`/`Verification`. Use `prismaRaw` only when you deliberately need to bypass that.

**Auth is enforced.** [middleware.ts](src/middleware.ts) redirects any request without a session to `/login` (public: `/login`, `/api/auth`). User roles are `construction_manager | hr | admin`.

**Who may do what.** Despite the `/admin/` URL prefix, **employees and sites are not admin-only** — [Sidebar.tsx](src/components/Sidebar.tsx) lists `/admin/employees` and `/admin/sites` in `baseItems`, visible to every authenticated role, alongside `/board`, `/stats` and `/export`. Only `/admin/users`, `/admin/audit` and `/admin/settings` are admin-gated (`adminItems`). Do not "fix" the employees/sites pages by adding `requireAdminPage()` — that locks `hr` and `construction_manager` out of their actual job.

Guards in [roles.ts](src/server/better-auth/roles.ts): `requireAdminPage()` redirects (use in admin page components), `requireAdmin()` throws (admin-only actions/routes), `requireSession()` throws (any authenticated role). Convention: mutating actions get a guard, read-only ones do not — see `settings.ts`, where `getCompanySettings` is open and `updateCompanySettings` is gated.

**Every export in a `"use server"` file is its own POST endpoint, independent of which page imports it.** A page-level guard (`requireAdminPage()`) only protects rendering that page — it does nothing for the action itself, which stays callable directly by anyone with a session, regardless of role. Two real bugs found this way and fixed: `updateUser` in [users.ts](src/server/actions/users.ts) took a client-supplied `role` field and wrote it via Prisma with no guard at all — any authenticated user could grant themselves admin. `listUsers` in the same file returned every user's name/email/role/image with no guard, reachable by any role even though only the admin-gated `/admin/users` page ever calls it from the UI. Both now call `requireAdmin()`. When adding a new exported action, ask "what happens if this is called directly, bypassing the page it's meant to be used from" — the page guard is not the enforcement point.

**[board.ts](src/server/actions/board.ts) has no guard, on purpose.** It relies on middleware alone. `getSession()` is `React.cache()`-wrapped, but that only dedupes within a single request — each server-action call is its own request, and middleware's check is a separate `betterFetch` round-trip that shares nothing with it. Adding `requireSession()` there would put a second real session lookup on every drag, split, merge, copy and availability toggle. Deliberate tradeoff, not an oversight. Revisit only if middleware stops being a real session check (see [AUDIT.md](AUDIT.md)).

**Uploaded avatars are not static files.** Both employee and user avatar uploads go through `POST /api/upload/{employees,users}`, land in `data/uploads/{employees,users}/` (outside `public/`, see `uploadDir()` in [imageUpload.ts](src/lib/imageUpload.ts)), and are served back through `GET /api/files/{employees,users}/[filename]` — a real route handler, not a static path, so it requires a session and sets `Content-Type` from a fixed extension map rather than trusting the file. `requireSession()` guards both kinds (not `requireAdmin()` for users — `/profile` lets every role upload their *own* avatar through the same endpoint; per-target authorization happens downstream in `updateCurrentUser` vs. `updateUser`, not at the upload/serve layer). `isValidUploadFilename()` is the path-traversal guard on the way back out — a served filename must match the exact `${randomUUID()}.${ext}` shape or it's rejected before touching the filesystem. In Docker, this directory is a mounted volume (`uploads_data` in [docker-compose.yml](docker-compose.yml)) so avatars survive a redeploy; locally it's gitignored under `/data/uploads/`.

**No hardcoded UI strings.** Everything user-visible goes through next-intl. Add keys to **both** `messages/en.json` and `messages/de.json` under the right namespace (`Common, Status, Nav, Login, Employees, Sites, Users, Stats, Board, Audit, Export, Settings, Profile, Metadata`). Same for locale-dependent formatting — pass the locale explicitly, never rely on the runtime default.

**No hardcoded colours.** Use the CSS variables in [globals.css](src/styles/globals.css) (`--color-*`, `--am-*`, `--pm-*`, accent). Both `[data-theme="dark"]` (default) and `[data-theme="light"]` must stay consistent when a variable is added.

**Board mutations are optimistic and queued.** `BoardClient` updates local state first, then `enqueue("label", () => serverAction(...))` through [mutationQueue.ts](src/components/board/mutationQueue.ts), which retries with backoff. Do not call board server actions directly from UI handlers. The state-rebuild effect deliberately skips while mutations are in flight (`syncPendingRef`) so optimistic state is not clobbered by stale server props.

**Board cell ids.** All in [boardIds.ts](src/components/board/boardIds.ts): droppable ids are built by `fullDayDroppableId(projectId, day)` / `preLunchDroppableId` / `afterLunchDroppableId` / `poolFullDayId(day)`, and parsed back with `getProjectIdFromDroppableId` / `getDayPartFromDroppableId`. Never hand-assemble these strings. That module imports by relative path (not the `~/` alias) so the tests can load it under `node --experimental-strip-types`.

**Past-week edits** go through `confirmPastEdit(...)`, which asks the user before mutating a week that has already passed.

## DB Connection

PostgreSQL runs in WSL; Prisma connects via `localhost:5432` from Windows. Docker Compose + Caddy configs live in the repo root for deployment.

## Compaction Instructions

When compacting, always preserve:
- The list of files modified in this session
- Any pending migration names or schema changes
- Current feature being implemented
