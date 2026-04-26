import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { getSession } from "~/server/better-auth/server";
import { getUserPreferences } from "~/server/actions/preferences";

export const metadata: Metadata = {
  title: "Gridspatch",
  description: "Weekly construction staffing board",
  icons: [
    { rel: "icon", url: "/logo.svg", type: "image/svg+xml" },
  ],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession().catch(() => null);
  const prefs = session?.user?.id ? await getUserPreferences().catch(() => null) : null;

  const rules: string[] = [];
  if (prefs?.accentColor) rules.push(`--color-accent:${prefs.accentColor}`);
  if (prefs?.amColor) rules.push(`--am-hue:${prefs.amColor}`);
  if (prefs?.pmColor) rules.push(`--pm-hue:${prefs.pmColor}`);
  if (prefs?.uiScale && prefs.uiScale !== 1) rules.push(`--ui-scale:${prefs.uiScale}`);
  const inlineVars = rules.length > 0 ? `:root{${rules.join(";")}}` : null;
  const theme = prefs?.theme ?? "dark";

  return (
    <html lang="en" className={`${geist.variable}`} data-theme={theme}>
      {inlineVars && (
        <head>
          <style dangerouslySetInnerHTML={{ __html: inlineVars }} />
        </head>
      )}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
