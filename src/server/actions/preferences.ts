"use server";

import { headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";

export type UserPrefs = {
  accentColor: string | null;
  amColor: string | null;
  pmColor: string | null;
  uiScale: number | null;
};

type PrefDb = {
  userPreference: {
    findUnique: (args: {
      where: { userId: string };
      select: { accentColor: true; amColor: true; pmColor: true; uiScale: true };
    }) => Promise<UserPrefs | null>;
    upsert: (args: {
      where: { userId: string };
      update: UserPrefs;
      create: UserPrefs & { userId: string };
    }) => Promise<unknown>;
  };
};

const prefDb = db as unknown as PrefDb;

export async function getUserPreferences(): Promise<UserPrefs | null> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) return null;

  return prefDb.userPreference.findUnique({
    where: { userId: session.user.id },
    select: { accentColor: true, amColor: true, pmColor: true, uiScale: true },
  });
}

export async function saveUserPreferences(prefs: UserPrefs): Promise<void> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) throw new Error("Not authenticated");

  await prefDb.userPreference.upsert({
    where: { userId: session.user.id },
    update: prefs,
    create: { userId: session.user.id, ...prefs },
  });
}
