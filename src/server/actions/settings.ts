"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { isAdmin } from "~/server/better-auth/roles";

const SETTINGS_ID = "singleton";
const DEFAULT_HOURS_PER_DAY = 8;
const zHoursPerDay = z.number().finite().positive().max(24);

export async function getCompanySettings(): Promise<{ hoursPerDay: number }> {
  const settings = await db.companySettings.findUnique({ where: { id: SETTINGS_ID } });
  return { hoursPerDay: settings?.hoursPerDay ?? DEFAULT_HOURS_PER_DAY };
}

export async function updateCompanySettings(hoursPerDay: number): Promise<{ success: true }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!isAdmin(session?.user?.role)) throw new Error("Admin access required");
  const parsedHours = zHoursPerDay.parse(hoursPerDay);

  await db.companySettings.upsert({
    where: { id: SETTINGS_ID },
    update: { hoursPerDay: parsedHours },
    create: { id: SETTINGS_ID, hoursPerDay: parsedHours },
  });
  return { success: true };
}
