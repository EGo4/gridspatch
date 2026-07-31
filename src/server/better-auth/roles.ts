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
