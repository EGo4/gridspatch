"use server";

import { cookies, headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { zLocale } from "~/server/validation";

export async function setLocale(locale: string): Promise<void> {
  const result = zLocale.safeParse(locale);
  if (!result.success) return;
  locale = result.data;

  const cs = await cookies();
  cs.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) return;

  await db.userPreference.upsert({
    where: { userId: session.user.id },
    update: { locale },
    create: { userId: session.user.id, locale },
  });
}
