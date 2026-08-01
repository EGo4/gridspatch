// src/server/services/activityYears.ts
//
// "Active in year X" for sites/employees = at least one Assignment dated in
// that year. Availability (sick/vacation) is deliberately excluded — see
// FEATURE_ROADMAP.md "Year filters" ("default: assignments only").

export type ActivityYearsDb = {
  $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

type ProjectYearRow = { projectId: string; year: number };
type EmployeeYearRow = { employeeId: string; year: number };

export type ActivityYears = {
  /** Years with at least one assignment anywhere, newest first. */
  years: number[];
  /** projectId -> years that project had at least one assignment in. */
  projectYears: Record<string, number[]>;
  /** employeeId -> years that employee had at least one assignment in. */
  employeeYears: Record<string, number[]>;
};

export const buildActivityYears = (
  projectRows: ProjectYearRow[],
  employeeRows: EmployeeYearRow[],
): ActivityYears => {
  const projectYears: Record<string, number[]> = {};
  const employeeYears: Record<string, number[]> = {};
  const yearSet = new Set<number>();

  for (const row of projectRows) {
    (projectYears[row.projectId] ??= []).push(row.year);
    yearSet.add(row.year);
  }
  for (const row of employeeRows) {
    (employeeYears[row.employeeId] ??= []).push(row.year);
    yearSet.add(row.year);
  }

  return {
    years: [...yearSet].sort((a, b) => b - a),
    projectYears,
    employeeYears,
  };
};

export const getActivityYears = async (db: ActivityYearsDb): Promise<ActivityYears> => {
  const [projectRows, employeeRows] = await Promise.all([
    db.$queryRaw<ProjectYearRow[]>`
      SELECT "projectId", EXTRACT(YEAR FROM "date")::int AS year
      FROM "Assignment"
      WHERE "projectId" IS NOT NULL
      GROUP BY "projectId", year
    `,
    db.$queryRaw<EmployeeYearRow[]>`
      SELECT "employeeId", EXTRACT(YEAR FROM "date")::int AS year
      FROM "Assignment"
      GROUP BY "employeeId", year
    `,
  ]);

  return buildActivityYears(projectRows, employeeRows);
};
