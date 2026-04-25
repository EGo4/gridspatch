import { db } from "~/server/db";
import { SitesClient } from "./SitesClient";
import { listConstructionManagers } from "~/server/actions/users";
import type { ProjectStatus } from "~/types";
import { toDateParam } from "~/lib/week";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  constructionManagerId: string | null;
  constructionManager?: { id: string; name: string } | null;
  statusTransitions: { weekStartDate: Date; status: string }[];
};

export default async function SitesPage() {
  const [rows, managers] = await Promise.all([
    (db as unknown as {
      project: {
        findMany: (args: {
          orderBy: { name: "asc" };
          include: {
            constructionManager: { select: { id: true; name: true } };
            statusTransitions: { orderBy: { weekStartDate: "asc" } };
          };
        }) => Promise<ProjectRow[]>;
      };
    }).project.findMany({
      orderBy: { name: "asc" },
      include: {
        constructionManager: { select: { id: true, name: true } },
        statusTransitions: { orderBy: { weekStartDate: "asc" } },
      },
    }),
    listConstructionManagers(),
  ]);

  const todayIso = toDateParam(new Date());

  const sites = rows.map((r) => {
    const applicable = r.statusTransitions.filter(
      (t) => toDateParam(t.weekStartDate) <= todayIso,
    );
    const effectiveStatus: ProjectStatus =
      applicable.length > 0
        ? (applicable[applicable.length - 1]!.status as ProjectStatus)
        : "planned";

    return {
      id: r.id,
      name: r.name,
      description: r.description,
      startDate: r.startDate,
      endDate: r.endDate,
      status: effectiveStatus,
      constructionManagerId: r.constructionManagerId,
      constructionManagerName: r.constructionManager?.name ?? null,
    };
  });

  return <SitesClient sites={sites} managers={managers} />;
}
