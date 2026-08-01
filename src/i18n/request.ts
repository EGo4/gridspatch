import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { defaultLocale, locales, type Locale } from "./config";

export default getRequestConfig(async () => {
  let raw: string | undefined;

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (session?.user?.id) {
    const pref = await db.userPreference.findUnique({
      where: { userId: session.user.id },
      select: { locale: true },
    });
    raw = pref?.locale ?? undefined;
  }

  if (!raw) {
    const cookieStore = await cookies();
    raw = cookieStore.get("locale")?.value;
  }

  const locale: Locale = locales.includes(raw as Locale) ? (raw as Locale) : defaultLocale;
  return {
    locale,
    messages: ((await import(`../../messages/${locale}.json`)) as { default: Record<string, unknown> }).default,
  };
});
