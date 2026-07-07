"use server";

import { headers } from "next/headers";
import { prismaRaw } from "~/server/db";
import { auth } from "~/server/better-auth";

type AuditLogDb = {
  auditLog: {
    create: (args: {
      data: { action: string; model: string; path: string | null; payload: object };
    }) => Promise<unknown>;
  };
};

/**
 * Records a client-side mutation failure (e.g. a board edit that couldn't reach
 * the server) so it shows up next to normal audit entries instead of vanishing
 * silently. Written directly via prismaRaw — bypassing the audit-log query
 * extension, which only fires for successful writes.
 */
export async function reportClientError(
  label: string,
  message: string,
  attempt: number,
) {
  let path: string | null = null;
  let userId: string | null = null;
  try {
    const h = await headers();
    path = h.get("referer");
    const session = await auth.api.getSession({ headers: h });
    userId = session?.user?.id ?? null;
  } catch {
    // best-effort context only
  }

  await (prismaRaw as unknown as AuditLogDb).auditLog.create({
    data: {
      action: "client_error",
      model: label,
      path,
      payload: { message, attempt, userId },
    },
  });

  return { success: true };
}
