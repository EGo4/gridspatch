import { db } from "~/server/db";
import { toDateParam } from "~/lib/week";
import { EmployeesClient } from "./EmployeesClient";
import { requireSessionPage } from "~/server/better-auth/roles";
import { getActivityYears } from "~/server/services/activityYears";

export default async function EmployeesPage() {
  await requireSessionPage();
  const [rows, activityYears] = await Promise.all([
    db.employee.findMany({ orderBy: { name: "asc" } }),
    getActivityYears(db),
  ]);

  return (
    <EmployeesClient
      employees={rows.map((r) => ({
        ...r,
        startDate: r.startDate ? toDateParam(r.startDate) : null,
        endDate: r.endDate ? toDateParam(r.endDate) : null,
      }))}
      years={activityYears.years}
      employeeYears={activityYears.employeeYears}
    />
  );
}
