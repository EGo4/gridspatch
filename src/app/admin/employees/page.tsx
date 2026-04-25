import { db } from "~/server/db";
import { toDateParam } from "~/lib/week";
import { EmployeesClient } from "./EmployeesClient";

type EmployeeRow = {
  id: string;
  name: string;
  initials: string;
  img: string | null;
  role: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

export default async function EmployeesPage() {
  const rows = await (db as unknown as {
    employee: { findMany: (args: { orderBy: { name: "asc" } }) => Promise<EmployeeRow[]> };
  }).employee.findMany({ orderBy: { name: "asc" } });

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
