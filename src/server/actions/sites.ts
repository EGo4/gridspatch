"use server";

import { db } from "~/server/db";
import type { ProjectStatus } from "~/types";
import { getSuperStatus } from "~/types";
import { normalizeWeekStart, getWeekEnd, toDateParam } from "~/lib/week";

type SiteDb = {
  project: {
    findMany: (args?: {
      orderBy?: { name: "asc" | "desc" };
      include?: { constructionManager?: { select?: { id?: boolean; name?: boolean } } };
    }) => Promise<
      Array<{
        id: string;
        name: string;
        description: string | null;
        startDate: Date | null;
        endDate: Date | null;
        status: string;
        constructionManagerId: string | null;
        constructionManager?: { id: string; name: string } | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >;
    create: (args: {
      data: {
        name: string;
        description?: string | null;
        startDate?: Date | null;
        endDate?: Date | null;
        status: string;
        constructionManagerId?: string | null;
      };
    }) => Promise<{ id: string }>;
    update: (args: {
      where: { id: string };
      data: {
        name?: string;
        description?: string | null;
        startDate?: Date | null;
        endDate?: Date | null;
        status?: string;
        constructionManagerId?: string | null;
      };
    }) => Promise<{ id: string }>;
    delete: (args: { where: { id: string } }) => Promise<{ id: string }>;
  };
};

const siteDb = db as unknown as SiteDb;

// ── Week-status DB type ────────────────────────────────────────────────────────

type WeekStatusRow = { weekId: string; status: string };
type WeekStatusRowWithWeek = { weekId: string; status: string; week: { startDate: Date } };

type WeekStatusDb = {
  projectWeekStatus: {
    findMany: {
      (args: { where: { projectId: string }; include: { week: { select: { startDate: boolean } } } }): Promise<WeekStatusRowWithWeek[]>;
      (args: { where: { projectId: string } }): Promise<WeekStatusRow[]>;
    };
    upsert: (args: {
      where: { projectId_weekId: { projectId: string; weekId: string } };
      update: { status: string };
      create: { projectId: string; weekId: string; status: string };
    }) => Promise<unknown>;
    updateMany: (args: {
      where: { projectId: string; status: { in: string[] } };
      data: { status: string };
    }) => Promise<unknown>;
  };
  week: {
    upsert: (args: {
      where: { startDate: Date };
      update: { endDate: Date };
      create: { startDate: Date; endDate: Date; isCurrent: boolean };
    }) => Promise<{ id: string }>;
  };
};

const weekStatusDb = db as unknown as WeekStatusDb;

export async function createSite(input: {
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: ProjectStatus;
  constructionManagerId?: string | null;
}) {
  const site = await siteDb.project.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      status: input.status,
      constructionManagerId: input.constructionManagerId ?? null,
    },
  });
  return { id: site.id };
}

export async function updateSite(input: {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: ProjectStatus;
  constructionManagerId?: string | null;
}) {
  await siteDb.project.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      status: input.status,
      constructionManagerId: input.constructionManagerId ?? null,
      ...("description" in input && { description: input.description?.trim() ?? null }),
      ...("startDate" in input && { startDate: input.startDate ? new Date(input.startDate) : null }),
      ...("endDate" in input && { endDate: input.endDate ? new Date(input.endDate) : null }),
    },
  });
  return { success: true };
}

export async function deleteSite(id: string) {
  await siteDb.project.delete({ where: { id } });
  return { success: true };
}

// ── Week-status actions ────────────────────────────────────────────────────────

export async function getSiteWeekStatuses(
  projectId: string,
): Promise<{ weekStartIso: string; status: string }[]> {
  const rows = await weekStatusDb.projectWeekStatus.findMany({
    where: { projectId },
    include: { week: { select: { startDate: true } } },
  });
  return rows.map((r) => ({
    weekStartIso: toDateParam(r.week.startDate),
    status: r.status,
  }));
}

type SetWeekStatusesResult =
  | { success: true }
  | { warn: "completed_to_ongoing" }
  | { blocked: true };

export async function setSiteWeekStatuses(
  projectId: string,
  weekStartDates: string[],
  status: ProjectStatus,
  force = false,
): Promise<SetWeekStatusesResult> {
  // Determine the site's current overall phase from all existing week statuses.
  const existing = await weekStatusDb.projectWeekStatus.findMany({ where: { projectId } });
  const statuses = existing.map((r) => r.status as ProjectStatus);
  const hasCompleted = statuses.some((s) => getSuperStatus(s) === "completed");
  const hasOngoing = statuses.some((s) => getSuperStatus(s) === "ongoing");
  const currentPhase = hasCompleted ? "completed" : hasOngoing ? "ongoing" : "preparation";

  const newSuper = getSuperStatus(status);

  // Blocked: can never revert back to preparation once past it.
  if (currentPhase !== "preparation" && newSuper === "preparation") {
    return { blocked: true };
  }

  // Warning: completed → ongoing requires confirmation.
  if (currentPhase === "completed" && newSuper === "ongoing" && !force) {
    return { warn: "completed_to_ongoing" };
  }

  // Forced completed → ongoing: reset all completed weeks to on_hold first.
  if (force && currentPhase === "completed" && newSuper === "ongoing") {
    await weekStatusDb.projectWeekStatus.updateMany({
      where: { projectId, status: { in: ["done", "inactive"] } },
      data: { status: "on_hold" },
    });
  }

  // Apply the new status to each selected week (upsert week record as needed).
  for (const weekStartIso of weekStartDates) {
    const weekStart = normalizeWeekStart(weekStartIso);
    const weekEnd = getWeekEnd(weekStart);
    const week = await weekStatusDb.week.upsert({
      where: { startDate: weekStart },
      update: { endDate: weekEnd },
      create: { startDate: weekStart, endDate: weekEnd, isCurrent: false },
    });
    await weekStatusDb.projectWeekStatus.upsert({
      where: { projectId_weekId: { projectId, weekId: week.id } },
      update: { status },
      create: { projectId, weekId: week.id, status },
    });
  }

  return { success: true };
}
