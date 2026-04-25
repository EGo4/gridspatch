# Gridspatch

Gridspatch is a weekly construction staffing board built with Next.js, Prisma, and Better Auth.

## Setup

```bash
git clone <repo>
cd gridspatch
npm install
cp .env.example .env          # then edit .env — see below
```

Edit `.env` and set `DATABASE_URL` and `BETTER_AUTH_SECRET`. The connection string format is:

```
postgresql://<user>:<password>@<host>:<port>/<database>
```

> Trouble with credentials? See [Authentication failed (P1000)](#authentication-failed-p1000) and [DATABASE_URL not found](#database_url-not-found).

**Start the database — pick one:**

**A) Docker (recommended):**
```bash
./start-database.sh           # reads DATABASE_URL from .env, creates a container to match
```
> On Windows, run this inside WSL with Docker Desktop or Podman Desktop running.

**B) Existing PostgreSQL:**
```bash
sudo service postgresql start
```
> Credentials in `DATABASE_URL` must match your existing Postgres user. See [Using an existing PostgreSQL installation](#using-an-existing-postgresql-installation).

**Apply migrations and seed:**

```bash
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
```

**Start the dev server:**

```bash
npm run dev
```

**Create the first admin user** (only needed once on a fresh database):

```bash
npx tsx scripts/create-admin.ts "Your Name" you@example.com yourpassword
```

Then log in at `http://localhost:3000/login` and create further users from the admin panel.

> Public sign-up is disabled — this script is the only way to bootstrap the first account.

## Daily development

```bash
npm run dev          # start dev server (Turbopack)
npm run check        # lint + typecheck
npm run test         # run tests
npm run db:studio    # Prisma Studio
```

After editing `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name <description>
```

## Current Scope

- Weekly board view with per-week history
- Drag-and-drop assignment management with day-column visual feedback
- Per-day employee pool handling
- Week navigation with dropdown selector
- Quick marking of employees as vacation or sick
- Split employee days into pre-lunch / after-lunch
- Copy assignments from another day

Full feature plans in [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md).

## Deployment Target

Planned:
- Ubuntu 22.04 or 24.04, local network hosting
- Docker: app container + PostgreSQL container + persistent volumes
- Optional Caddy reverse proxy with DuckDNS for remote access

What still needs to be added: production `Dockerfile`, `docker-compose.yml`, production env example, deployment scripts.

See [Caddy + DuckDNS setup](#caddy--duckdns-setup) if you need external access.

---

## Troubleshooting

### DATABASE_URL not found

```
Error: Environment variable not found: DATABASE_URL
```

The `.env` file is gitignored and won't exist on a fresh clone. Fix:

```bash
cp .env.example .env
```

Then fill in `DATABASE_URL` and `BETTER_AUTH_SECRET`.

---

### Authentication failed (P1000)

```
Error: P1000: Authentication failed against database server
```

The password in `DATABASE_URL` doesn't match what your Postgres instance expects. Every part of the connection string must match exactly:

```
postgresql://postgres:password@localhost:5432/gridspatch
             ^^^^^^^^ ^^^^^^^^  ^^^^^^^^^^ ^^^^^^^^^^^^
             user     password  host       database
```

**If using Docker (`start-database.sh`):** the script sets the container password from whatever is in `DATABASE_URL`. If you changed the password in `.env` after already creating the container, the container still has the old password. Either update `DATABASE_URL` back to the old password, or delete the container and re-run the script:

```bash
docker rm -f gridspatch-postgres
./start-database.sh
```

---

### Using an existing PostgreSQL installation

Set (or look up) the postgres user password, then update `DATABASE_URL` to match:

```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'yourpassword';"
```

```
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/gridspatch"
```

Create the database if it doesn't exist:

```bash
sudo -u postgres createdb gridspatch
```

---

### Migrations out of sync

If Prisma reports schema drift, reset and re-seed:

```bash
npx prisma migrate reset    # drops all data, re-applies all migrations
npx tsx prisma/seed.ts
```

---

### Caddy + DuckDNS setup

For remote access via a DuckDNS domain:

1. Point your DuckDNS domain to your public IP.
2. Forward router ports `80` and `443` to the Ubuntu server.
3. Run Caddy on the host or in Docker, reverse-proxying the DuckDNS hostname to the app.
4. Use the final HTTPS URL for auth base URL settings once login is rolled out.

Notes:
- Caddy should be the only public-facing service; the app stays on an internal port.
- If the app is local-network only, you don't need DuckDNS at all.

---

## Notes

- The app entry redirects from `/` to `/board`.
- Authentication is wired up but not enforced — the board is the current focus.
