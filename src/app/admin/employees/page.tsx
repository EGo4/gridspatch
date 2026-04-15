import { db } from "~/server/db";
import { EmployeesClient } from "./EmployeesClient";

type EmployeeRow = {
  id: string;
  name: string;
  initials: string;
  img: string | null;
  role: string | null;
};

export default async function EmployeesPage() {
  const rows = await (db as unknown as {
    employee: { findMany: (args: { orderBy: { name: "asc" } }) => Promise<EmployeeRow[]> };
  }).employee.findMany({ orderBy: { name: "asc" } });

  return <EmployeesClient employees={rows} />;
}
