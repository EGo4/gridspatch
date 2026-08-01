import { redirect } from "next/navigation";
import { getSession } from "./server";

export type UserRole = "construction_manager" | "hr" | "admin";

export const isAdmin = (role?: string | null): boolean => role === "admin";

/** Page guard: redirects to /board unless the session user is an admin. */
export async function requireAdminPage() {
  const session = await getSession();
  if (!isAdmin(session?.user?.role)) redirect("/board");
  return session;
}

/**
 * Page guard: redirects to /login unless a session exists. Does not check
 * role — same "any authenticated role" scope as requireSession() below, just
 * for page components instead of actions/routes (redirect vs. throw).
 *
 * Needed because middleware.ts only checks session-cookie *presence*, not
 * validity (see the comment there) — a page that reads the DB directly
 * without calling this is reachable with a forged cookie. Every page that
 * fetches data without going through a client component's own action calls
 * needs this: board, admin/employees, admin/sites, stats, export. Admin-only
 * pages use requireAdminPage() instead, which already implies a session.
 */
export async function requireSessionPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  return session;
}

/**
 * Server-action / route-handler guard: throws unless a session exists.
 * Does not check role — employee, site, and upload management are intentionally
 * available to every authenticated role, matching the unconditional nav items
 * in Sidebar.tsx. This exists for defense-in-depth (mutations should not rely
 * solely on middleware), not to restrict who can call these actions.
 */
export async function requireSession() {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session;
}

/** Server-action / route-handler guard: throws unless the session user is an admin. */
export async function requireAdmin() {
  const session = await getSession();
  if (!isAdmin(session?.user?.role)) throw new Error("Admin access required");
  return session;
}
