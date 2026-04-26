import { formatWeekLabel, toDateParam } from "../../lib/week";
import type { DayPart, ProjectStatus } from "../../types/index";

const DAY_WEIGHT: Record<DayPart, number> = {
  full_day: 1,
  pre_lunch: 0.5,
  after_lunch: 0.5,
};

export type EmployeeStat = {
  employeeId: string;
  employeeName: string;
  totalDays: number;
  sickDays: number;
  vacationDays: number;
};

export type SiteStat = {
  projectId: string;
  projectName: string;
  managerName: string | null;
  status: ProjectStatus;
  totalEmployeeDays: number;
  weeksCovered: number;
};

export type ManagerStat = {
  managerId: string | null;
  managerName: string;
  siteCount: number;
  totalEmployeeDays: number;
};

export type WeekOption = {
  param: string;
  label: string;
};

export type WeekPoint = {
  weekParam: string;
  weekLabel: string;
  employeeDays: number;
};

export type SitePoint = {
  projectId: string;
  projectName: string;
  days: number;
};

export type StatsPageData = {
  employeeStats: EmployeeStat[];
  siteStats: SiteStat[];
  managerStats: ManagerStat[];
  allWeeks: WeekOption[];
  fromParam: string;
  toParam: string;
  /** Per-site: employee-days per week in range. Keyed by projectId. */
  siteWeeklyData: Record<string, WeekPoint[]>;
  /** Per-employee: days per site. Keyed by employeeId. */
  employeeSiteData: Record<string, SitePoint[]>;
  /** Per-manager: employee-days per week. Keyed by managerId or "__none__". */
  managerWeeklyData: Record<string, WeekPoint[]>;
};

type WeekRecord = { id: string; startDate: Date };
type AssignmentRecord = {
  employeeId: string;
  projectId: string | null;
  weekId: string;
  dayPart: string;
};
type AvailabilityRecord = { employeeId: string; weekId: string; status: string };
type EmployeeRecord = { id: string; name: string };
type ProjectRecord = {
  id: string;
  name: string;
  constructionManagerId: string | null;
  constructionManager?: { id: string; name: string } | null;
  statusTransitions: { weekStartDate: Date; status: string }[];
};

export type StatsDb = {
  week: {
    findMany: (args: { orderBy: { startDate: "asc" | "desc" } }) => Promise<WeekRecord[]>;
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
    findMany: (args: {
      orderBy: { name: "asc" };
      include: {
        constructionManager: { select: { id: true; name: true } };
        statusTransitions: { orderBy: { weekStartDate: "asc" } };
      };
    }) => Promise<ProjectRecord[]>;
  };
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export const getStatsPageData = async (
  database: StatsDb,
  fromParam?: string,
  toParam?: string,
): Promise<StatsPageData> => {
  const allWeekRecords = await database.week.findMany({ orderBy: { startDate: "asc" } });

  const allWeeks: WeekOption[] = allWeekRecords.map((w) => ({
    param: toDateParam(w.startDate),
    label: formatWeekLabel(w.startDate),
  }));

  const empty: StatsPageData = {
    employeeStats: [], siteStats: [], managerStats: [],
    allWeeks, fromParam: "", toParam: "",
    siteWeeklyData: {}, employeeSiteData: {}, managerWeeklyData: {},
  };

  if (allWeekRecords.length === 0) return empty;

  const defaultFrom = toDateParam(allWeekRecords[0]!.startDate);
  const defaultTo   = toDateParam(allWeekRecords[allWeekRecords.length - 1]!.startDate);
  const resolvedFrom = fromParam ?? defaultFrom;
  const resolvedTo   = toParam ?? defaultTo;

  const rangeWeeks = allWeekRecords.filter((w) => {
    const p = toDateParam(w.startDate);
    return p >= resolvedFrom && p <= resolvedTo;
  });
  const weekIds = rangeWeeks.map((w) => w.id);

  if (weekIds.length === 0) {
    return { ...empty, allWeeks, fromParam: resolvedFrom, toParam: resolvedTo };
  }

  const [assignments, availabilities, employees, projects] = await Promise.all([
    database.assignment.findMany({ where: { weekId: { in: weekIds } } }),
    database.availability.findMany({ where: { weekId: { in: weekIds } } }),
    database.employee.findMany({ orderBy: { name: "asc" } }),
    database.project.findMany({
      orderBy: { name: "asc" },
      include: {
        constructionManager: { select: { id: true, name: true } },
        statusTransitions: { orderBy: { weekStartDate: "asc" } },
      },
    }),
  ]);

  // ── Lookup maps ────────────────────────────────────────────────────────────

  const weekById = new Map(rangeWeeks.map((w) => [w.id, w]));
  const projMap  = new Map(projects.map((p) => [p.id, p]));

  // project → manager key
  const projMgrKey = new Map<string, string>();
  for (const p of projects) {
    projMgrKey.set(p.id, p.constructionManagerId ?? "__none__");
  }

  // ── Accumulate assignment weights ─────────────────────────────────────────

  // employee totals
  const empDays = new Map<string, number>();
  // employee × site
  const empSiteDays = new Map<string, Map<string, number>>();
  // site totals
  const siteDays = new Map<string, number>();
  // site × week
  const siteWeekDays = new Map<string, Map<string, number>>();
  // manager × week
  const mgrWeekDays = new Map<string, Map<string, number>>();
  // manager sites
  const mgrSites = new Map<string, Set<string>>();

  for (const a of assignments) {
    if (!a.projectId) continue;
    const w = DAY_WEIGHT[a.dayPart as DayPart] ?? 0;

    empDays.set(a.employeeId, (empDays.get(a.employeeId) ?? 0) + w);

    let empSite = empSiteDays.get(a.employeeId);
    if (!empSite) { empSite = new Map(); empSiteDays.set(a.employeeId, empSite); }
    empSite.set(a.projectId, (empSite.get(a.projectId) ?? 0) + w);

    siteDays.set(a.projectId, (siteDays.get(a.projectId) ?? 0) + w);

    let siteWk = siteWeekDays.get(a.projectId);
    if (!siteWk) { siteWk = new Map(); siteWeekDays.set(a.projectId, siteWk); }
    siteWk.set(a.weekId, (siteWk.get(a.weekId) ?? 0) + w);

    const mgrKey = projMgrKey.get(a.projectId) ?? "__none__";
    let mgrWk = mgrWeekDays.get(mgrKey);
    if (!mgrWk) { mgrWk = new Map(); mgrWeekDays.set(mgrKey, mgrWk); }
    mgrWk.set(a.weekId, (mgrWk.get(a.weekId) ?? 0) + w);

    let ms = mgrSites.get(mgrKey);
    if (!ms) { ms = new Set(); mgrSites.set(mgrKey, ms); }
    ms.add(a.projectId);
  }

  // ── Availability (sick / vacation) ────────────────────────────────────────

  const empSick     = new Map<string, number>();
  const empVacation = new Map<string, number>();

  for (const av of availabilities) {
    if (av.status === "sick") {
      empSick.set(av.employeeId, (empSick.get(av.employeeId) ?? 0) + 1);
    } else if (av.status === "vacation") {
      empVacation.set(av.employeeId, (empVacation.get(av.employeeId) ?? 0) + 1);
    }
  }

  // ── Employee stats ─────────────────────────────────────────────────────────

  const activeEmpIds = new Set([...empDays.keys(), ...empSick.keys(), ...empVacation.keys()]);
  const employeeStats: EmployeeStat[] = employees
    .filter((e) => activeEmpIds.has(e.id))
    .map((e) => ({
      employeeId:   e.id,
      employeeName: e.name,
      totalDays:    round1(empDays.get(e.id) ?? 0),
      sickDays:     empSick.get(e.id) ?? 0,
      vacationDays: empVacation.get(e.id) ?? 0,
    }))
    .sort((a, b) => b.totalDays - a.totalDays);

  // ── Effective project status at end of range ───────────────────────────────

  const projStatusMap = new Map<string, ProjectStatus>();
  for (const p of projects) {
    const applicable = p.statusTransitions.filter((t) => toDateParam(t.weekStartDate) <= resolvedTo);
    const status: ProjectStatus =
      applicable.length > 0 ? (applicable[applicable.length - 1]!.status as ProjectStatus) : "planned";
    projStatusMap.set(p.id, status);
  }

  // ── Site stats ─────────────────────────────────────────────────────────────

  const siteWeeks = new Map<string, Set<string>>();
  for (const [projectId, wkMap] of siteWeekDays.entries()) {
    siteWeeks.set(projectId, new Set(wkMap.keys()));
  }

  const siteStats: SiteStat[] = projects
    .filter((p) => siteDays.has(p.id))
    .map((p) => ({
      projectId:        p.id,
      projectName:      p.name,
      managerName:      p.constructionManager?.name ?? null,
      status:           projStatusMap.get(p.id) ?? "planned",
      totalEmployeeDays: round1(siteDays.get(p.id) ?? 0),
      weeksCovered:     siteWeeks.get(p.id)?.size ?? 0,
    }))
    .sort((a, b) => b.totalEmployeeDays - a.totalEmployeeDays);

  // ── Manager stats ──────────────────────────────────────────────────────────

  const mgrDays  = new Map<string, number>();
  const mgrNames = new Map<string, string>();

  for (const p of projects) {
    const days = siteDays.get(p.id);
    if (!days) continue;
    const key = p.constructionManagerId ?? "__none__";
    mgrNames.set(key, p.constructionManager?.name ?? "Unassigned");
    mgrDays.set(key, (mgrDays.get(key) ?? 0) + days);
  }

  const managerStats: ManagerStat[] = Array.from(mgrDays.entries())
    .map(([key, days]) => ({
      managerId:         key === "__none__" ? null : key,
      managerName:       mgrNames.get(key) ?? "Unassigned",
      siteCount:         mgrSites.get(key)?.size ?? 0,
      totalEmployeeDays: round1(days),
    }))
    .sort((a, b) => b.totalEmployeeDays - a.totalEmployeeDays);

  // ── Drill-down: site weekly data ───────────────────────────────────────────

  const siteWeeklyData: Record<string, WeekPoint[]> = {};
  for (const [projectId, wkMap] of siteWeekDays.entries()) {
    siteWeeklyData[projectId] = rangeWeeks
      .filter((w) => wkMap.has(w.id))
      .map((w) => ({
        weekParam:   toDateParam(w.startDate),
        weekLabel:   formatWeekLabel(w.startDate),
        employeeDays: round1(wkMap.get(w.id) ?? 0),
      }));
  }

  // ── Drill-down: employee site data ─────────────────────────────────────────

  const employeeSiteData: Record<string, SitePoint[]> = {};
  for (const [empId, siteMap] of empSiteDays.entries()) {
    employeeSiteData[empId] = Array.from(siteMap.entries())
      .map(([projectId, days]) => ({
        projectId,
        projectName: projMap.get(projectId)?.name ?? projectId,
        days: round1(days),
      }))
      .sort((a, b) => b.days - a.days);
  }

  // ── Drill-down: manager weekly data ───────────────────────────────────────

  const managerWeeklyData: Record<string, WeekPoint[]> = {};
  for (const [mgrKey, wkMap] of mgrWeekDays.entries()) {
    managerWeeklyData[mgrKey] = rangeWeeks
      .filter((w) => wkMap.has(w.id))
      .map((w) => ({
        weekParam:   toDateParam(w.startDate),
        weekLabel:   formatWeekLabel(w.startDate),
        employeeDays: round1(wkMap.get(w.id) ?? 0),
      }));
  }

  return {
    employeeStats, siteStats, managerStats,
    allWeeks, fromParam: resolvedFrom, toParam: resolvedTo,
    siteWeeklyData, employeeSiteData, managerWeeklyData,
  };
};
