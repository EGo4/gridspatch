# Gridspatch

Gridspatch is a weekly construction staffing board built with Next.js, Prisma, and Better Auth.

## Upcoming Features

- Swimlane minimizing *(mid)*
- Building site management — add, edit, status *(mid)*
- Construction manager per building site *(mid)*
- User management for resources and managers *(mid)*
- Login and route protection *(mid)*
- Personal account management *(mid)*
- Copy previous week as template *(mid)*
- Statistics on worked weeks *(mid)*
- Light mode with toggle *(low)*
- Docker deployment for local network hosting *(low)*

Full details in [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md).

## Current Scope

- Weekly board view with per-week history
- Drag-and-drop assignment management with day-column visual feedback
- Per-day employee pool handling
- Week navigation with dropdown selector
- Quick marking of employees as vacation or sick
- Split employee days into pre-lunch / after-lunch
- Copy assignments from another day

## Development

```bash
npm install
npm run dev
```

## Database

### First-time setup (fresh database)

The database runs in WSL. Prisma commands can be run from Windows (PowerShell/cmd) — they connect via `localhost:5432`.

1. Start the database (in WSL):

   ```bash
   # e.g. docker compose up -d  or  sudo service postgresql start
   ```

2. Create and apply all migrations:

   ```bash
   npx prisma migrate dev --name init
   ```

3. Seed development data (employees, projects, current week):

   ```bash
   npx tsx prisma/seed.ts
   ```

### Schema changes

After editing `prisma/schema.prisma`, create and apply a new migration:

```bash
npx prisma migrate dev --name <description>
```

> **Note:** `npm run db:seed` requires `tsx` to be installed globally. Use `npx tsx prisma/seed.ts` if it isn't.

### If migrations are out of sync with the database

If Prisma reports drift (schema and migration history don't match), reset the dev database and re-apply everything:

```bash
npx prisma migrate reset   # drops all data, re-applies all migrations
npx tsx prisma/seed.ts     # re-seed
```

### Other useful commands

```bash
npm run db:push     # push schema directly without migrations (skips migration history)
npm run db:studio   # open Prisma Studio
```

## Deployment Target

Planned deployment target:
- Ubuntu 22.04 or 24.04
- Local network hosting
- Optional Docker-based deployment
- Optional Caddy reverse proxy with DuckDNS

## Docker Deployment Plan

The intended production setup is:
- `gridspatch` app container
- PostgreSQL container
- persistent Docker volumes
- optional Caddy in front of the app

What still needs to be added to the repo:
- production `Dockerfile`
- `docker-compose.yml`
- production env example
- deployment scripts or step-by-step commands

Recommended target layout:
- App listens on an internal container port
- PostgreSQL is only exposed to Docker/internal network
- Caddy handles public HTTP/HTTPS if remote access is needed

## If You Use Caddy And DuckDNS

If the app should be reachable via a DuckDNS URL, the usual setup is:

1. Point your DuckDNS domain to your public IP.
2. Forward router ports `80` and `443` to the Ubuntu server.
3. Run Caddy on the Ubuntu host or in Docker.
4. Configure Caddy to reverse proxy the DuckDNS hostname to the Gridspatch app.
5. Use the final HTTPS DuckDNS URL for auth/app base URL settings once login is fully rolled out.

Practical notes:
- Caddy should be the only public-facing service.
- The app container itself should usually stay behind Caddy on an internal port.
- If the app is local-network only, you do not need DuckDNS at all.
- If you use local-only hosting, accessing the app via local IP or internal DNS is simpler.

## Notes

- The app entry redirects from `/` to `/board`.
- Authentication is present in the codebase for future rollout, but the planning board is currently the main focus.
