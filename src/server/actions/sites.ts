"use server";

import { db } from "~/server/db";
import type { ProjectStatus } from "~/types";
import { getSuperStatus, ALLOWED_TRANSITIONS } from "~/types";
import { normalizeWeekStart, toDateParam } from "~/lib/week";

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
        constructionManagerId?: string | null;
      };
    }) => Promise<{ id: string }>;
    delete: (args: { where: { id: string } }) => Promise<{ id: string }>;
  };
};

const siteDb = db as unknown as SiteDb;

// ── Transition DB type ─────────────────────────────────────────────────────────

type TransitionRow = { projectId: string; weekStartDate: Date; status: string };

type TransitionDb = {
  projectStatusTransition: {
    findMany: (args: {
      where: { projectId: string };
      orderBy: { weekStartDate: "asc" };
    }) => Promise<TransitionRow[]>;
    upsert: (args: {
      where: { projectId_weekStartDate: { projectId: string; weekStartDate: Date } };
      update: { status: string };
      create: { projectId: string; weekStartDate: Date; status: string };
    }) => Promise<unknown>;
    updateMany: (args: {
      where: { projectId: string; status: { in: string[] } };
      data: { status: string };
    }) => Promise<unknown>;
    deleteMany: (args: {
      where: { projectId: string; weekStartDate: Date };
    }) => Promise<unknown>;
  };
};

const transitionDb = db as unknown as TransitionDb;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getEffectiveStatus(
  transitions: TransitionRow[],
  weekStartIso: string,
): ProjectStatus {
  const applicable = transitions.filter(
    (t) => toDateParam(t.weekStartDate) <= weekStartIso,
  );
  return applicable.length > 0
    ? (applicable[applicable.length - 1]!.status as ProjectStatus)
    : "planned";
}

// ── Site CRUD ──────────────────────────────────────────────────────────────────

export async function createSite(input: {
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  constructionManagerId?: string | null;
}) {
  const site = await siteDb.project.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
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
  constructionManagerId?: string | null;
}) {
  await siteDb.project.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
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

// ── Transition actions ─────────────────────────────────────────────────────────

export async function getSiteTransitions(
  projectId: string,
): Promise<{ weekStartIso: string; status: ProjectStatus }[]> {
  const rows = await transitionDb.projectStatusTransition.findMany({
    where: { projectId },
    orderBy: { weekStartDate: "asc" },
  });
  return rows.map((r) => ({
    weekStartIso: toDateParam(r.weekStartDate),
    status: r.status as ProjectStatus,
  }));
}

type SetTransitionResult =
  | { success: true }
  | { warn: "completed_to_ongoing" }
  | { warn: "ongoing_after_completed" }
  | { blocked: true };

export async function setSiteTransition(
  projectId: string,
  weekStartIso: string,
  status: ProjectStatus,
  force = false,
): Promise<SetTransitionResult> {
  const existing = await transitionDb.projectStatusTransition.findMany({
    where: { projectId },
    orderBy: { weekStartDate: "asc" },
  });

  const effectiveStatus = getEffectiveStatus(existing, weekStartIso);
  const allowed = ALLOWED_TRANSITIONS[effectiveStatus];

  if (!allowed.includes(status)) {
    return { blocked: true };
  }

  const isCompletedToOngoing =
    getSuperStatus(effectiveStatus) === "completed" &&
    getSuperStatus(status) === "ongoing";

  if (isCompletedToOngoing && !force) {
    return { warn: "completed_to_ongoing" };
  }

  if (isCompletedToOngoing && force) {
    await transitionDb.projectStatusTransition.updateMany({
      where: { projectId, status: { in: ["done", "inactive"] } },
      data: { status: "on_hold" },
    });
  }

  // When setting a completed status, later ongoing transitions become inconsistent.
  const isSettingCompleted = getSuperStatus(status) === "completed";
  if (isSettingCompleted) {
    const laterOngoing = existing.filter(
      (t) =>
        toDateParam(t.weekStartDate) > weekStartIso &&
        getSuperStatus(t.status as ProjectStatus) === "ongoing",
    );
    if (laterOngoing.length > 0 && !force) {
      return { warn: "ongoing_after_completed" };
    }
    if (laterOngoing.length > 0 && force) {
      for (const t of laterOngoing) {
        await transitionDb.projectStatusTransition.deleteMany({
          where: { projectId, weekStartDate: t.weekStartDate },
        });
      }
    }
  }

  const weekStart = normalizeWeekStart(weekStartIso);
  await transitionDb.projectStatusTransition.upsert({
    where: { projectId_weekStartDate: { projectId, weekStartDate: weekStart } },
    update: { status },
    create: { projectId, weekStartDate: weekStart, status },
  });

  // Prune transitions that are redundant (same status as the one before them).
  const allAfter = await transitionDb.projectStatusTransition.findMany({
    where: { projectId },
    orderBy: { weekStartDate: "asc" },
  });
  let prev: ProjectStatus = "planned";
  for (const t of allAfter) {
    if (t.status === prev) {
      await transitionDb.projectStatusTransition.deleteMany({
        where: { projectId, weekStartDate: t.weekStartDate },
      });
    } else {
      prev = t.status as ProjectStatus;
    }
  }

  return { success: true };
}

export async function bulkCreateSites(
  items: Array<{
    name: string;
    description?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>,
): Promise<{ created: number; errors: number }> {
  let created = 0;
  let errors = 0;
  for (const item of items) {
    try {
      await siteDb.project.create({
        data: {
          name: item.name.trim(),
          description: item.description?.trim() ?? null,
          startDate: item.startDate ? new Date(item.startDate) : null,
          endDate: item.endDate ? new Date(item.endDate) : null,
        },
      });
      created++;
    } catch {
      errors++;
    }
  }
  return { created, errors };
}

export async function deleteSiteTransition(
  projectId: string,
  weekStartIso: string,
): Promise<{ success: true }> {
  const weekStart = normalizeWeekStart(weekStartIso);
  await transitionDb.projectStatusTransition.deleteMany({
    where: { projectId, weekStartDate: weekStart },
  });
  return { success: true };
}
