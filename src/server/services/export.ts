import { DAYS } from "../../lib/constants.ts";
import { formatWeekLabel, getDayNameFromDate, toDateIso, toDateParam } from "../../lib/week.ts";
import type { DayPart } from "../../types/index.ts";

const DAY_WEIGHT: Record<DayPart, number> = {
  full_day: 1,
  pre_lunch: 0.5,
  after_lunch: 0.5,
};

// ── DB shape ──────────────────────────────────────────────────────────────────

type WeekRecord = { id: string; startDate: Date };
type AssignmentRecord = { employeeId: string; projectId: string | null; weekId: string; date: Date; dayPart: string };
type AvailabilityRecord = { employeeId: string; weekId: string; date: Date; status: string };
type EmployeeRecord = { id: string; name: string };
type ProjectRecord = { id: string; name: string };

export type ExportDb = {
  week: {
    findMany: (args: { orderBy: { startDate: "asc" } }) => Promise<WeekRecord[]>;
  };
  assignment: {
    findMany: (args: { where: { weekId: { in: string[] } } }) => Promise<AssignmentRecord[]>;
  };
  availability: {
    findMany: (args: { where: { weekId: { in: string[] } } }) => Promise<AvailabilityRecord[]>;
  };
  employee: {
    findMany: (args: { orderBy: { name: "asc" } }) => Promise<EmployeeRecord[]>;
  };
  project: {
    findMany: (args: { orderBy: { name: "asc" } }) => Promise<ProjectRecord[]>;
  };
};

// ── Week resolution ───────────────────────────────────────────────────────────

export type WeekOption = {
  id: string;
  param: string;
  startDateIso: string;
  label: string;
  year: number;
  month: number; // 1-12, taken from the week's Monday
};

export type ExportMode = "week" | "weeks" | "month" | "year";

export type ExportRangeParams =
  | { mode: "week"; week: string }
  | { mode: "weeks"; from: string; to: string }
  | { mode: "month"; year: number; month: number }
  | { mode: "year"; year: number };

export const listExportWeeks = async (database: ExportDb, locale = "en-GB"): Promise<WeekOption[]> => {
  const weeks = await database.week.findMany({ orderBy: { startDate: "asc" } });
  return weeks.map((w) => ({
    id: w.id,
    param: toDateParam(w.startDate),
    startDateIso: toDateIso(w.startDate),
    label: formatWeekLabel(w.startDate, locale),
    year: w.startDate.getUTCFullYear(),
    month: w.startDate.getUTCMonth() + 1,
  }));
};

/** Resolves a range selection down to the concrete weeks it covers (Monday's month/year attributes a boundary-spanning week to one period). */
export const resolveWeeksForRange = (weeks: WeekOption[], range: ExportRangeParams): WeekOption[] => {
  switch (range.mode) {
    case "week":
      return weeks.filter((w) => w.param === range.week);
    case "weeks":
      return weeks.filter((w) => w.param >= range.from && w.param <= range.to);
    case "month":
      return weeks.filter((w) => w.year === range.year && w.month === range.month);
    case "year":
      return weeks.filter((w) => w.year === range.year);
  }
};

// ── Aggregation ───────────────────────────────────────────────────────────────

export type EmployeeDrivenRow = { employeeName: string; hoursPerSite: number[]; sick: number; vacation: number };
export type EmployeeDrivenSheet = { siteNames: string[]; rows: EmployeeDrivenRow[] };

export type SiteDrivenDayRow = { employeeName: string; days: number[]; total: number };
export type SiteDrivenSheet = {
  sites: { siteName: string; rows: SiteDrivenDayRow[] }[];
  sickRows: SiteDrivenDayRow[];
  vacationRows: SiteDrivenDayRow[];
};

export type ExportSheet = {
  weekLabel: string;
  employeeDriven: EmployeeDrivenSheet;
  siteDriven: SiteDrivenSheet;
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export const buildExportData = async (
  database: ExportDb,
  weeks: WeekOption[],
  hoursPerDay: number,
): Promise<ExportSheet[]> => {
  if (weeks.length === 0) return [];

  const weekIds = weeks.map((w) => w.id);
  const [assignments, availabilities, employees, projects] = await Promise.all([
    database.assignment.findMany({ where: { weekId: { in: weekIds } } }),
    database.availability.findMany({ where: { weekId: { in: weekIds } } }),
    database.employee.findMany({ orderBy: { name: "asc" } }),
    database.project.findMany({ orderBy: { name: "asc" } }),
  ]);

  const empNameById = new Map(employees.map((e) => [e.id, e.name]));
  const projNameById = new Map(projects.map((p) => [p.id, p.name]));

  const assignmentsByWeek = new Map<string, AssignmentRecord[]>();
  for (const a of assignments) {
    let arr = assignmentsByWeek.get(a.weekId);
    if (!arr) { arr = []; assignmentsByWeek.set(a.weekId, arr); }
    arr.push(a);
  }

  const availabilitiesByWeek = new Map<string, AvailabilityRecord[]>();
  for (const av of availabilities) {
    let arr = availabilitiesByWeek.get(av.weekId);
    if (!arr) { arr = []; availabilitiesByWeek.set(av.weekId, arr); }
    arr.push(av);
  }

  return weeks.map((week) => buildWeekSheet(week, assignmentsByWeek.get(week.id) ?? [], availabilitiesByWeek.get(week.id) ?? [], empNameById, projNameById, hoursPerDay));
};

const buildWeekSheet = (
  week: WeekOption,
  weekAssignments: AssignmentRecord[],
  weekAvailabilities: AvailabilityRecord[],
  empNameById: Map<string, string>,
  projNameById: Map<string, string>,
  hoursPerDay: number,
): ExportSheet => {
  // employeeId -> projectId -> hours this week
  const empSiteHours = new Map<string, Map<string, number>>();
  // projectId -> employeeId -> hours per day (index 0-4 = Mon-Fri)
  const siteEmpDays = new Map<string, Map<string, number[]>>();

  for (const a of weekAssignments) {
    if (!a.projectId) continue;
    const dayName = getDayNameFromDate(a.date, week.startDateIso);
    if (!dayName) continue;
    const dayIndex = DAYS.indexOf(dayName);
    const hours = (DAY_WEIGHT[a.dayPart as DayPart] ?? 0) * hoursPerDay;

    let empSite = empSiteHours.get(a.employeeId);
    if (!empSite) { empSite = new Map(); empSiteHours.set(a.employeeId, empSite); }
    empSite.set(a.projectId, (empSite.get(a.projectId) ?? 0) + hours);

    let siteEmp = siteEmpDays.get(a.projectId);
    if (!siteEmp) { siteEmp = new Map(); siteEmpDays.set(a.projectId, siteEmp); }
    let days = siteEmp.get(a.employeeId);
    if (!days) { days = [0, 0, 0, 0, 0]; siteEmp.set(a.employeeId, days); }
    days[dayIndex] = (days[dayIndex] ?? 0) + hours;
  }

  // employeeId -> day count
  const empSick = new Map<string, number>();
  const empVacation = new Map<string, number>();
  // employeeId -> 0/1 per day
  const empSickDays = new Map<string, number[]>();
  const empVacationDays = new Map<string, number[]>();

  for (const av of weekAvailabilities) {
    const dayName = getDayNameFromDate(av.date, week.startDateIso);
    if (!dayName) continue;
    const dayIndex = DAYS.indexOf(dayName);
    const countMap = av.status === "sick" ? empSick : av.status === "vacation" ? empVacation : null;
    const dayMap = av.status === "sick" ? empSickDays : av.status === "vacation" ? empVacationDays : null;
    if (!countMap || !dayMap) continue;

    countMap.set(av.employeeId, (countMap.get(av.employeeId) ?? 0) + 1);
    let days = dayMap.get(av.employeeId);
    if (!days) { days = [0, 0, 0, 0, 0]; dayMap.set(av.employeeId, days); }
    days[dayIndex] = 1;
  }

  // ── Employee-driven ──────────────────────────────────────────────────────
  const siteIdsWithAssignments = Array.from(siteEmpDays.keys())
    .sort((a, b) => (projNameById.get(a) ?? a).localeCompare(projNameById.get(b) ?? b));
  const siteNames = siteIdsWithAssignments.map((id) => projNameById.get(id) ?? id);

  const activeEmpIds = new Set([...empSiteHours.keys(), ...empSick.keys(), ...empVacation.keys()]);
  const employeeDrivenRows: EmployeeDrivenRow[] = Array.from(activeEmpIds)
    .map((empId) => ({
      employeeName: empNameById.get(empId) ?? empId,
      hoursPerSite: siteIdsWithAssignments.map((siteId) => round1(empSiteHours.get(empId)?.get(siteId) ?? 0)),
      sick: empSick.get(empId) ?? 0,
      vacation: empVacation.get(empId) ?? 0,
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  // ── Site-driven ──────────────────────────────────────────────────────────
  const sites = siteIdsWithAssignments.map((siteId) => {
    const empDays = siteEmpDays.get(siteId)!;
    const rows: SiteDrivenDayRow[] = Array.from(empDays.entries())
      .map(([empId, days]) => ({
        employeeName: empNameById.get(empId) ?? empId,
        days: days.map(round1),
        total: round1(days.reduce((sum, h) => sum + h, 0)),
      }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    return { siteName: projNameById.get(siteId) ?? siteId, rows };
  });

  const toAbsenceRows = (dayMap: Map<string, number[]>): SiteDrivenDayRow[] =>
    Array.from(dayMap.entries())
      .map(([empId, days]) => ({
        employeeName: empNameById.get(empId) ?? empId,
        days,
        total: days.reduce((sum, d) => sum + d, 0),
      }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return {
    weekLabel: week.label,
    employeeDriven: { siteNames, rows: employeeDrivenRows },
    siteDriven: { sites, sickRows: toAbsenceRows(empSickDays), vacationRows: toAbsenceRows(empVacationDays) },
  };
};

// ── CSV rendering ─────────────────────────────────────────────────────────────

export type CsvLabels = {
  weekPrefix: string;
  sitePrefix: string;
  employee: string;
  sick: string;
  vacation: string;
  total: string;
  days: string[]; // Mon..Fri, length 5
};

const escapeCsvField = (value: string | number): string => {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

const csvRow = (fields: Array<string | number>): string => fields.map(escapeCsvField).join(",");

export const renderEmployeeDrivenCsv = (sheets: ExportSheet[], labels: CsvLabels): string => {
  const blocks = sheets.map((sheet) => {
    const header = [labels.employee, ...sheet.employeeDriven.siteNames, labels.sick, labels.vacation];
    const rows = sheet.employeeDriven.rows.map((r) => csvRow([r.employeeName, ...r.hoursPerSite, r.sick, r.vacation]));
    return [`${labels.weekPrefix}: ${sheet.weekLabel}`, csvRow(header), ...rows].join("\n");
  });
  return blocks.join("\n\n");
};

export const renderSiteDrivenCsv = (sheets: ExportSheet[], labels: CsvLabels): string => {
  const dayHeader = [labels.employee, ...labels.days, labels.total];

  const blocks = sheets.map((sheet) => {
    const siteBlocks = sheet.siteDriven.sites.map((site) => {
      const rows = site.rows.map((r) => csvRow([r.employeeName, ...r.days, r.total]));
      return [`${labels.sitePrefix}: ${site.siteName}`, csvRow(dayHeader), ...rows].join("\n");
    });

    const sickBlock = [labels.sick, csvRow(dayHeader), ...sheet.siteDriven.sickRows.map((r) => csvRow([r.employeeName, ...r.days, r.total]))].join("\n");
    const vacationBlock = [labels.vacation, csvRow(dayHeader), ...sheet.siteDriven.vacationRows.map((r) => csvRow([r.employeeName, ...r.days, r.total]))].join("\n");

    return [`${labels.weekPrefix}: ${sheet.weekLabel}`, ...siteBlocks, sickBlock, vacationBlock].join("\n\n");
  });

  return blocks.join("\n\n");
};
