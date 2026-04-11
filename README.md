# Gridspatch

Gridspatch is a weekly construction staffing board built with Next.js, Prisma, and Better Auth.

## Current Scope

- Weekly board view for employees and projects
- Drag-and-drop assignment management
- Per-day employee pool handling
- Feature roadmap in [FEATURE_ROADMAP.md](./FEATURE_ROADMAP.md)

## Development

```bash
npm install
npm run dev
```

## Database

Useful commands:

```bash
npm run db:push
npm run db:seed
npm run db:studio
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
