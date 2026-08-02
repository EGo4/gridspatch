import { db } from "~/server/db";
import { SitesClient } from "./SitesClient";
import { listConstructionManagers } from "~/server/actions/users";
import type { ProjectStatus } from "~/types";
import { toDateParam } from "~/lib/week";
import { requireSessionPage } from "~/server/better-auth/roles";
import { getActivityYears } from "~/server/services/activityYears";

export default async function SitesPage() {
  await requireSessionPage();
  const [rows, managers, activityYears] = await Promise.all([
    db.project.findMany({
      orderBy: { name: "asc" },
      include: {
        constructionManager: { select: { id: true, name: true } },
        statusTransitions: { orderBy: { weekStartDate: "asc" } },
      },
    }),
    listConstructionManagers(),
    getActivityYears(db),
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
      status: effectiveStatus,
      constructionManagerId: r.constructionManagerId,
      constructionManagerName: r.constructionManager?.name ?? null,
      firstActiveDate: r.statusTransitions.find((t) => t.status === "active")?.weekStartDate ?? null,
      doneDate: effectiveStatus === "done" ? applicable[applicable.length - 1]!.weekStartDate : null,
    };
  });

  return (
    <SitesClient
      sites={sites}
      managers={managers}
      years={activityYears.years}
      siteYears={activityYears.projectYears}
    />
  );
}
