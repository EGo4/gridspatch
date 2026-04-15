# Gridspatch — Claude Context

## What This Project Is

Weekly construction staffing board. Employees are dragged onto projects across Mon–Fri. Assignments track `date`, `dayPart` (full_day / pre_lunch / after_lunch), `employeeId`, `projectId`, and `weekId`.

Auth (Better Auth) is wired up but not enforced — the board is the current focus.

## Stack

- **Framework**: Next.js 15 (App Router, Turbopack dev)
- **Language**: TypeScript 5.8 (strict)
- **Database**: PostgreSQL via Prisma 6
- **Auth**: Better Auth 1.3
- **UI**: React 19, Tailwind CSS 4, @hello-pangea/dnd (drag-and-drop)
- **Validation**: Zod

## Key Scripts

```bash
npm run dev          # start dev server (Turbopack)
npm run check        # lint + typecheck
npm run typecheck    # tsc --noEmit only
npm run test         # run tests (node --experimental-strip-types)

npx prisma migrate dev --name <description>   # schema change → new migration
npx prisma migrate reset                       # reset dev DB (drops data)
npx tsx prisma/seed.ts                         # re-seed after reset
npm run db:studio                              # Prisma Studio
```

## File Structure

```
src/
  app/
    board/page.tsx           # main board page
    admin/sites/             # admin UI
    api/auth/                # Better Auth route
    layout.tsx
    page.tsx                 # redirects / → /board
  components/board/
    BoardClient.tsx          # drag-and-drop board logic
    EmployeeCard.tsx
  server/
    actions/board.ts         # server actions for board mutations
    actions/sites.ts
    services/board.ts        # board data-fetching logic
    db.ts                    # Prisma client singleton
    better-auth/             # auth config and client
  lib/
    constants.ts
    week.ts                  # week date utilities
  types/index.ts
  env.js                     # validated env vars (@t3-oss/env-nextjs)
prisma/schema.prisma         # DB schema (Employee, Project, Week, Assignment)
```

## Database Schema (Core Models)

- **Employee**: id, name, initials, img?, role?
- **Project**: id, name, description?, startDate?, endDate?, status (active | on_hold | not_active)
- **Week**: id, startDate (unique), endDate, isCurrent
- **Assignment**: employeeId + date + dayPart (unique composite), weekId, projectId?

## DB Connection

PostgreSQL runs in WSL, Prisma connects via `localhost:5432` from Windows.

## Compaction Instructions

When compacting, always preserve:
- The list of files modified in this session
- Any pending migration names or schema changes
- Current feature being implemented
