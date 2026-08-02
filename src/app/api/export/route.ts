import { z } from "zod";
import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "~/server/db";
import { requireSession } from "~/server/better-auth/roles";
import { getCompanySettings } from "~/server/actions/settings";
import { zDateParam } from "~/server/validation";
import {
  listExportWeeks,
  resolveWeeksForRange,
  buildExportData,
  renderEmployeeDrivenCsv,
  renderSiteDrivenCsv,
  type ExportRangeParams,
  type CsvLabels,
} from "~/server/services/export";

const zYear = z.coerce.number().int().min(1970).max(2200);
const zMonth = z.coerce.number().int().min(1).max(12);

const rangeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("week"), week: zDateParam }),
  z.object({ mode: z.literal("weeks"), from: zDateParam, to: zDateParam }),
  z.object({ mode: z.literal("month"), year: zYear, month: zMonth }),
  z.object({ mode: z.literal("year"), year: zYear }),
]);

function parseRange(searchParams: URLSearchParams): ExportRangeParams | null {
  const result = rangeSchema.safeParse({
    mode: searchParams.get("mode"),
    week: searchParams.get("week"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    year: searchParams.get("year"),
    month: searchParams.get("month"),
  });
  return result.success ? result.data : null;
}

export async function GET(request: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

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
    school: t("csvSchool"),
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
