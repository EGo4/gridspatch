import { getLocale } from "next-intl/server";
import { db } from "~/server/db";
import { listExportWeeks, type ExportDb } from "~/server/services/export";
import { getCompanySettings } from "~/server/actions/settings";
import { ExportClient } from "./ExportClient";

export default async function ExportPage() {
  const locale = await getLocale();
  const [weeks, { hoursPerDay }] = await Promise.all([
    listExportWeeks(db as unknown as ExportDb, locale),
    getCompanySettings(),
  ]);

  return <ExportClient weeks={weeks} hoursPerDay={hoursPerDay} />;
}
