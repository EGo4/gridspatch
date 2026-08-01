"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { zHexColor, zLocale, zTheme } from "~/server/validation";

export type UserPrefs = {
  accentColor: string | null;
  amColor: string | null;
  pmColor: string | null;
  uiScale: number | null;
  theme: string | null;
  locale?: string | null;
};

const prefsSchema = z.object({
  accentColor: zHexColor.nullable(),
  amColor: zHexColor.nullable(),
  pmColor: zHexColor.nullable(),
  uiScale: z.number().min(0.5).max(2).nullable(),
  theme: zTheme.nullable(),
  locale: zLocale.nullable().optional(),
});

export async function getUserPreferences(): Promise<UserPrefs | null> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) return null;

  return db.userPreference.findUnique({
    where: { userId: session.user.id },
    select: { accentColor: true, amColor: true, pmColor: true, uiScale: true, theme: true, locale: true },
  });
}

export async function saveUserPreferences(prefs: UserPrefs): Promise<void> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) throw new Error("Not authenticated");
  const parsed = prefsSchema.parse(prefs);

  await db.userPreference.upsert({
    where: { userId: session.user.id },
    update: parsed,
    create: { userId: session.user.id, ...parsed },
  });
}

export async function saveThemePreference(theme: "dark" | "light"): Promise<void> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) throw new Error("Not authenticated");
  const parsedTheme = zTheme.parse(theme);

  await db.userPreference.upsert({
    where: { userId: session.user.id },
    update: { theme: parsedTheme },
    create: { userId: session.user.id, accentColor: null, amColor: null, pmColor: null, uiScale: null, theme: parsedTheme },
  });
}
