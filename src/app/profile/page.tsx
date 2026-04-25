import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";
import { getUserPreferences } from "~/server/actions/preferences";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const u = session.user as {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    role?: string;
  };

  const prefs = await getUserPreferences().catch(() => null);

  return (
    <ProfileClient
      user={{
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image ?? null,
        role: u.role ?? "construction_manager",
      }}
      initialPrefs={prefs}
    />
  );
}
