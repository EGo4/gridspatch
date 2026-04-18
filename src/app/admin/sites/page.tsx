import { db } from "~/server/db";
import { SitesClient } from "./SitesClient";
import { listConstructionManagers } from "~/server/actions/users";
import type { ProjectStatus } from "~/types";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  constructionManagerId: string | null;
  constructionManager?: { id: string; name: string } | null;
};

export default async function SitesPage() {
  const [rows, managers] = await Promise.all([
    (db as unknown as {
      project: {
        findMany: (args: {
          orderBy: { name: "asc" };
          include: { constructionManager: { select: { id: true; name: true } } };
        }) => Promise<ProjectRow[]>;
      };
    }).project.findMany({
      orderBy: { name: "asc" },
      include: { constructionManager: { select: { id: true, name: true } } },
    }),
    listConstructionManagers(),
  ]);

  const sites = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status as ProjectStatus,
    constructionManagerId: r.constructionManagerId,
    constructionManagerName: r.constructionManager?.name ?? null,
  }));

  return <SitesClient sites={sites} managers={managers} />;
}
