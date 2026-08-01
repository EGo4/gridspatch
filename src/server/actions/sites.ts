"use server";

import { db } from "~/server/db";
import type { ProjectStatus } from "~/types";
import { getSuperStatus, ALLOWED_TRANSITIONS } from "~/types";
import { normalizeWeekStart, toDateParam } from "~/lib/week";
import { requireSession } from "~/server/better-auth/roles";

type TransitionRow = { projectId: string; weekStartDate: Date; status: string };

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
  await requireSession();
  const site = await db.project.create({
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
  await requireSession();
  await db.project.update({
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
  await requireSession();
  await db.project.delete({ where: { id } });
  return { success: true };
}

// ── Transition actions ─────────────────────────────────────────────────────────

export async function getSiteTransitions(
  projectId: string,
): Promise<{ weekStartIso: string; status: ProjectStatus }[]> {
  const rows = await db.projectStatusTransition.findMany({
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
  await requireSession();
  const existing = await db.projectStatusTransition.findMany({
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
    await db.projectStatusTransition.updateMany({
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
        await db.projectStatusTransition.deleteMany({
          where: { projectId, weekStartDate: t.weekStartDate },
        });
      }
    }
  }

  const weekStart = normalizeWeekStart(weekStartIso);
  await db.projectStatusTransition.upsert({
    where: { projectId_weekStartDate: { projectId, weekStartDate: weekStart } },
    update: { status },
    create: { projectId, weekStartDate: weekStart, status },
  });

  // Prune transitions that are redundant (same status as the one before them).
  const allAfter = await db.projectStatusTransition.findMany({
    where: { projectId },
    orderBy: { weekStartDate: "asc" },
  });
  let prev: ProjectStatus = "planned";
  for (const t of allAfter) {
    if (t.status === prev) {
      await db.projectStatusTransition.deleteMany({
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
  await requireSession();
  let created = 0;
  let errors = 0;
  for (const item of items) {
    try {
      await db.project.create({
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

export async function bulkUpdateSites(
  ids: string[],
  updates: { status?: ProjectStatus; constructionManagerId?: string | null },
): Promise<{ updated: number; errors: number }> {
  await requireSession();
  let updated = 0;
  let errors = 0;
  const weekStart = normalizeWeekStart(toDateParam(new Date()));
  for (const id of ids) {
    try {
      if ("constructionManagerId" in updates) {
        await db.project.update({
          where: { id },
          data: { constructionManagerId: updates.constructionManagerId },
        });
      }
      if (updates.status !== undefined) {
        await db.projectStatusTransition.upsert({
          where: { projectId_weekStartDate: { projectId: id, weekStartDate: weekStart } },
          update: { status: updates.status },
          create: { projectId: id, weekStartDate: weekStart, status: updates.status },
        });
      }
      updated++;
    } catch {
      errors++;
    }
  }
  return { updated, errors };
}

export async function deleteSiteTransition(
  projectId: string,
  weekStartIso: string,
): Promise<{ success: true }> {
  await requireSession();
  const weekStart = normalizeWeekStart(weekStartIso);
  await db.projectStatusTransition.deleteMany({
    where: { projectId, weekStartDate: weekStart },
  });
  return { success: true };
}
