# Code Audit — open items

Findings from a read-through of the codebase on 2026-07-31, last revised 2026-08-01.
Resolved items are deleted from this file once verified — git history and [CLAUDE.md](CLAUDE.md) hold the reasoning worth keeping. What is written below is what is still **open**.

Feature work lives in [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md) — this file is about the existing code, not new functionality.

## Where to start

One item left.

| # | Item | Size | Why here |
| --- | --- | --- | --- |
| 1 | [Trim the middleware round-trip](#1-middleware-does-an-http-round-trip-on-every-request) | S | Was blocked on Zod validation landing first — now unblocked |

---

## 1. Middleware does an HTTP round-trip on every request

[middleware.ts](src/middleware.ts) calls `betterFetch("/api/auth/get-session")` against `http://localhost:${PORT}` for every non-static request, so each navigation costs an extra internal HTTP call plus a DB lookup.

Better Auth's recommended shape is an optimistic cookie-presence check in middleware, with real verification at the page/action layer.

**Why this was blocked, and why it no longer is.** A cookie-*presence* check is spoofable: any value passes. Middleware was the *only* auth for two things:

- [api/export/route.ts](src/app/api/export/route.ts) — now has its own `requireSession()` and Zod-validated query params, independent of middleware.
- [board.ts](src/server/actions/board.ts) — still deliberately relies on middleware alone (see the note in [CLAUDE.md](CLAUDE.md)); every argument is now Zod-validated, but that is input hygiene, not authentication. If middleware becomes a cookie-presence-only check, `board.ts` needs `requireSession()` added after all — decide this at the same time as the middleware change, not after.

Also note the hardcoded `http://localhost:${PORT}` base URL — worth confirming it behaves under the Docker Compose + Caddy setup in the repo root.
