import { db } from "~/server/db";
import { SitesClient } from "./SitesClient";
import type { ProjectStatus } from "~/types";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
};

export default async function SitesPage() {
  const rows = await (db as unknown as {
    project: { findMany: (args: { orderBy: { name: "asc" } }) => Promise<ProjectRow[]> };
  }).project.findMany({ orderBy: { name: "asc" } });

  const sites = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status as ProjectStatus,
  }));

  return <SitesClient sites={sites} />;
}
