"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { prismaRaw } from "~/server/db";
import { auth } from "~/server/better-auth";

const zLabel = z.string().trim().min(1).max(200);
const zMessage = z.string().trim().max(4000);
const zAttempt = z.number().int().min(0).max(1000);

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
  label = zLabel.parse(label);
  message = zMessage.parse(message);
  attempt = zAttempt.parse(attempt);

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

  await prismaRaw.auditLog.create({
    data: {
      action: "client_error",
      model: label,
      path,
      payload: { message, attempt, userId },
    },
  });

  return { success: true };
}
