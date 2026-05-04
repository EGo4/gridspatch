"use server";

import { cookies, headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { locales, type Locale } from "~/i18n/config";

type LocaleDb = {
  userPreference: {
    upsert: (args: {
      where: { userId: string };
      update: { locale: string };
      create: { userId: string; locale: string };
    }) => Promise<unknown>;
  };
};

const localeDb = db as unknown as LocaleDb;

export async function setLocale(locale: string): Promise<void> {
  if (!locales.includes(locale as Locale)) return;

  const cs = await cookies();
  cs.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) return;

  await localeDb.userPreference.upsert({
    where: { userId: session.user.id },
    update: { locale },
    create: { userId: session.user.id, locale },
  });
}
