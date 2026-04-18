import {
  formatWeekLabel,
  getCurrentWeekStart,
  getWeekEnd,
  normalizeWeekStart,
  parseWeekParam,
  toDateIso,
  toDateParam,
} from "../../lib/week.ts";
import type { Assignment, Availability, Employee, Project, ProjectStatus } from "../../types/index.ts";

type WeekRecord = {
  id: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
};

export type BoardDb = {
  assignment: {
    findMany: (args: { where: { weekId: string } }) => Promise<Assignment[]>;
  };
  availability: {
    findMany: (args: { where: { weekId: string } }) => Promise<Availability[]>;
  };
  employee: {
    findMany: () => Promise<Employee[]>;
  };
  project: {
    findMany: (args?: {
      orderBy?: { name: "asc" | "desc" };
      include?: { constructionManager?: { select?: { id?: boolean; name?: boolean } } };
    }) => Promise<Array<{
      id: string;
      name: string;
      description: string | null;
      startDate: Date | null;
      endDate: Date | null;
      status: string;
      constructionManagerId: string | null;
      constructionManager?: { id: string; name: string } | null;
    }>>;
  };
  projectWeekStatus: {
    findMany: (args: { where: { weekId: string } }) => Promise<Array<{
      projectId: string;
      status: string;
    }>>;
  };
  week: {
    findMany: (args: { orderBy: { startDate: "asc" | "desc" } }) => Promise<WeekRecord[]>;
    upsert: (args: {
      where: { startDate: Date };
      update: { endDate: Date };
      create: { startDate: Date; endDate: Date; isCurrent: boolean };
    }) => Promise<WeekRecord>;
  };
};

export type BoardWeek = {
  id: string;
  startDateIso: string;
  endDateIso: string;
  param: string;
  label: string;
  isCurrent: boolean;
};

const toBoardWeek = (week: WeekRecord): BoardWeek => ({
  id: week.id,
  startDateIso: toDateIso(week.startDate),
  endDateIso: toDateIso(week.endDate),
  param: toDateParam(week.startDate),
  label: formatWeekLabel(week.startDate),
  isCurrent: week.isCurrent,
});

export const getBoardPageData = async (database: BoardDb, requestedWeekParam?: string) => {
  const requestedWeek = parseWeekParam(requestedWeekParam) ?? getCurrentWeekStart();
  const weekStart = normalizeWeekStart(requestedWeek);
  const weekEnd = getWeekEnd(weekStart);
  const currentWeekStart = getCurrentWeekStart();

  const selectedWeek = await database.week.upsert({
    where: { startDate: weekStart },
    update: { endDate: weekEnd },
    create: {
      startDate: weekStart,
      endDate: weekEnd,
      isCurrent: toDateParam(weekStart) === toDateParam(currentWeekStart),
    },
  });

  const [weeks, rawProjects, employees, assignments, availabilities, rawWeekStatuses] = await Promise.all([
    database.week.findMany({ orderBy: { startDate: "desc" } }),
    database.project.findMany({
      orderBy: { name: "asc" },
      include: { constructionManager: { select: { id: true, name: true } } },
    }),
    database.employee.findMany(),
    database.assignment.findMany({ where: { weekId: selectedWeek.id } }),
    database.availability.findMany({ where: { weekId: selectedWeek.id } }),
    database.projectWeekStatus.findMany({ where: { weekId: selectedWeek.id } }),
  ]);

  const weekStatusMap: Record<string, string> = {};
  rawWeekStatuses.forEach((ws) => { weekStatusMap[ws.projectId] = ws.status; });

  const projects: Project[] = rawProjects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    startDate: p.startDate,
    endDate: p.endDate,
    status: p.status as ProjectStatus,
    constructionManagerId: p.constructionManagerId,
    constructionManagerName: p.constructionManager?.name ?? null,
  }));

  return {
    dbAssignments: assignments,
    dbAvailability: availabilities,
    dbEmployees: employees,
    dbProjects: projects,
    weekStatusMap,
    selectedWeek: toBoardWeek(selectedWeek),
    weeks: weeks.map(toBoardWeek),
  };
};
