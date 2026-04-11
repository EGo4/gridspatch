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

## Notes

- The app entry redirects from `/` to `/board`.
- Authentication is present in the codebase for future rollout, but the planning board is currently the main focus.
