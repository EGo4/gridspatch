import {
  formatWeekLabel,
  getCurrentWeekStart,
  getWeekEnd,
  normalizeWeekStart,
  parseWeekParam,
  toDateIso,
  toDateParam,
} from "../../lib/week.ts";
import type { Assignment, Employee, Project } from "../../types/index.ts";

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
  employee: {
    findMany: () => Promise<Employee[]>;
  };
  project: {
    findMany: (args?: { orderBy?: { name: "asc" | "desc" } }) => Promise<Project[]>;
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

  const [weeks, projects, employees, assignments] = await Promise.all([
    database.week.findMany({ orderBy: { startDate: "desc" } }),
    database.project.findMany({ orderBy: { name: "asc" } }),
    database.employee.findMany(),
    database.assignment.findMany({ where: { weekId: selectedWeek.id } }),
  ]);

  return {
    dbAssignments: assignments,
    dbEmployees: employees,
    dbProjects: projects,
    selectedWeek: toBoardWeek(selectedWeek),
    weeks: weeks.map(toBoardWeek),
  };
};
