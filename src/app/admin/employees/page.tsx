import { db } from "~/server/db";
import { toDateParam } from "~/lib/week";
import { EmployeesClient } from "./EmployeesClient";

export default async function EmployeesPage() {
  const rows = await db.employee.findMany({ orderBy: { name: "asc" } });

  return (
    <EmployeesClient
      employees={rows.map((r) => ({
        ...r,
        startDate: r.startDate ? toDateParam(r.startDate) : null,
        endDate: r.endDate ? toDateParam(r.endDate) : null,
      }))}
    />
  );
}
