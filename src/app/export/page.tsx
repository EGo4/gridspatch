import { getLocale } from "next-intl/server";
import { db } from "~/server/db";
import { listExportWeeks } from "~/server/services/export";
import { getCompanySettings } from "~/server/actions/settings";
import { ExportClient } from "./ExportClient";
import { requireSessionPage } from "~/server/better-auth/roles";

export default async function ExportPage() {
  await requireSessionPage();
  const locale = await getLocale();
  const [weeks, { hoursPerDay }] = await Promise.all([
    listExportWeeks(db, locale),
    getCompanySettings(),
  ]);

  return <ExportClient weeks={weeks} hoursPerDay={hoursPerDay} />;
}
