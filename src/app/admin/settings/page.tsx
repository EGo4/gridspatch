import { requireAdminPage } from "~/server/better-auth/roles";
import { getCompanySettings } from "~/server/actions/settings";
import { SettingsClient } from "./SettingsClient";

export default async function CompanySettingsPage() {
  await requireAdminPage();
  const { hoursPerDay } = await getCompanySettings();
  return <SettingsClient hoursPerDay={hoursPerDay} />;
}
