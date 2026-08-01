import { getLocale } from "next-intl/server";
import { db } from "~/server/db";
import { listExportWeeks } from "~/server/services/export";
import { getCompanySettings } from "~/server/actions/settings";
import { ExportClient } from "./ExportClient";

export default async function ExportPage() {
  const locale = await getLocale();
  const [weeks, { hoursPerDay }] = await Promise.all([
    listExportWeeks(db, locale),
    getCompanySettings(),
  ]);

  return <ExportClient weeks={weeks} hoursPerDay={hoursPerDay} />;
}
