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
