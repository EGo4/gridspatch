import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "~/server/db";
import { getCompanySettings } from "~/server/actions/settings";
import {
  listExportWeeks,
  resolveWeeksForRange,
  buildExportData,
  renderEmployeeDrivenCsv,
  renderSiteDrivenCsv,
  type ExportRangeParams,
  type CsvLabels,
} from "~/server/services/export";

function parseRange(searchParams: URLSearchParams): ExportRangeParams | null {
  const mode = searchParams.get("mode");

  if (mode === "week") {
    const week = searchParams.get("week");
    return week ? { mode: "week", week } : null;
  }
  if (mode === "weeks") {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    return from && to ? { mode: "weeks", from, to } : null;
  }
  if (mode === "month") {
    const year = Number(searchParams.get("year"));
    const month = Number(searchParams.get("month"));
    return Number.isInteger(year) && month >= 1 && month <= 12 ? { mode: "month", year, month } : null;
  }
  if (mode === "year") {
    const year = Number(searchParams.get("year"));
    return Number.isInteger(year) ? { mode: "year", year } : null;
  }
  return null;
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const layout = searchParams.get("layout") === "site" ? "site" : "employee";
  const range = parseRange(searchParams);

  if (!range) {
    return NextResponse.json({ error: "Invalid or missing range parameters" }, { status: 400 });
  }

  const locale = await getLocale();
  const t = await getTranslations("Export");

  const allWeeks = await listExportWeeks(db, locale);
  const weeks = resolveWeeksForRange(allWeeks, range);

  if (weeks.length === 0) {
    return NextResponse.json({ error: "No weeks in the selected range" }, { status: 400 });
  }

  const { hoursPerDay } = await getCompanySettings();
  const sheets = await buildExportData(db, weeks, hoursPerDay);

  const labels: CsvLabels = {
    weekPrefix: t("csvWeek"),
    sitePrefix: t("csvSite"),
    employee: t("csvEmployee"),
    sick: t("csvSick"),
    vacation: t("csvVacation"),
    total: t("csvTotal"),
    days: [t("csvMon"), t("csvTue"), t("csvWed"), t("csvThu"), t("csvFri")],
  };

  const csv = layout === "site" ? renderSiteDrivenCsv(sheets, labels) : renderEmployeeDrivenCsv(sheets, labels);

  const rangeSlug = range.mode === "week" ? range.week
    : range.mode === "weeks" ? `${range.from}_${range.to}`
    : range.mode === "month" ? `${range.year}-${String(range.month).padStart(2, "0")}`
    : String(range.year);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gridspatch-export-${layout}-${rangeSlug}.csv"`,
    },
  });
}
