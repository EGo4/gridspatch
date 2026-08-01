"use server";

import { z } from "zod";
import { db } from "~/server/db";
import type { ProjectStatus } from "~/types";
import { getSuperStatus, ALLOWED_TRANSITIONS } from "~/types";
import { normalizeWeekStart, toDateParam } from "~/lib/week";
import { requireSession } from "~/server/better-auth/roles";
import { zDateIso, zId, zProjectStatus } from "~/server/validation";

const zSiteName = z.string().trim().min(1).max(200);
const zDescription = z.string().trim().max(4000).nullable().optional();

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

const createSiteSchema = z.object({
  name: zSiteName,
  description: zDescription,
  startDate: zDateIso.nullable().optional(),
  endDate: zDateIso.nullable().optional(),
  constructionManagerId: zId.nullable().optional(),
});

export async function createSite(input: {
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  constructionManagerId?: string | null;
}) {
  await requireSession();
  const parsed = createSiteSchema.parse(input);
  const site = await db.project.create({
    data: {
      name: parsed.name,
      description: parsed.description?.trim() ?? null,
      startDate: parsed.startDate ? new Date(parsed.startDate) : null,
      endDate: parsed.endDate ? new Date(parsed.endDate) : null,
      constructionManagerId: parsed.constructionManagerId ?? null,
    },
  });
  return { id: site.id };
}

const updateSiteSchema = z.object({
  id: zId,
  name: zSiteName,
  description: zDescription,
  startDate: zDateIso.nullable().optional(),
  endDate: zDateIso.nullable().optional(),
  constructionManagerId: zId.nullable().optional(),
});

export async function updateSite(input: {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  constructionManagerId?: string | null;
}) {
  await requireSession();
  const parsed = updateSiteSchema.parse(input);
  await db.project.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      constructionManagerId: parsed.constructionManagerId ?? null,
      ...("description" in parsed && { description: parsed.description?.trim() ?? null }),
      ...("startDate" in parsed && { startDate: parsed.startDate ? new Date(parsed.startDate) : null }),
      ...("endDate" in parsed && { endDate: parsed.endDate ? new Date(parsed.endDate) : null }),
    },
  });
  return { success: true };
}

export async function deleteSite(id: string) {
  await requireSession();
  const parsedId = zId.parse(id);
  await db.project.delete({ where: { id: parsedId } });
  return { success: true };
}

// ── Transition actions ─────────────────────────────────────────────────────────

export async function getSiteTransitions(
  projectId: string,
): Promise<{ weekStartIso: string; status: ProjectStatus }[]> {
  const parsedProjectId = zId.parse(projectId);
  const rows = await db.projectStatusTransition.findMany({
    where: { projectId: parsedProjectId },
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
  projectId = zId.parse(projectId);
  weekStartIso = zDateIso.parse(weekStartIso);
  status = zProjectStatus.parse(status);
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

const bulkSiteItemSchema = z.object({
  name: zSiteName,
  description: zDescription,
  startDate: zDateIso.nullable().optional(),
  endDate: zDateIso.nullable().optional(),
});

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
  for (const rawItem of items) {
    const result = bulkSiteItemSchema.safeParse(rawItem);
    if (!result.success) {
      errors++;
      continue;
    }
    const item = result.data;
    try {
      await db.project.create({
        data: {
          name: item.name,
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

const bulkUpdateSchema = z.object({
  status: zProjectStatus.optional(),
  constructionManagerId: zId.nullable().optional(),
});

export async function bulkUpdateSites(
  ids: string[],
  updates: { status?: ProjectStatus; constructionManagerId?: string | null },
): Promise<{ updated: number; errors: number }> {
  await requireSession();
  const parsedIds = z.array(zId).parse(ids);
  const parsedUpdates = bulkUpdateSchema.parse(updates);
  let updated = 0;
  let errors = 0;
  const weekStart = normalizeWeekStart(toDateParam(new Date()));
  for (const id of parsedIds) {
    try {
      if ("constructionManagerId" in parsedUpdates) {
        await db.project.update({
          where: { id },
          data: { constructionManagerId: parsedUpdates.constructionManagerId },
        });
      }
      if (parsedUpdates.status !== undefined) {
        await db.projectStatusTransition.upsert({
          where: { projectId_weekStartDate: { projectId: id, weekStartDate: weekStart } },
          update: { status: parsedUpdates.status },
          create: { projectId: id, weekStartDate: weekStart, status: parsedUpdates.status },
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
  projectId = zId.parse(projectId);
  const weekStart = normalizeWeekStart(zDateIso.parse(weekStartIso));
  await db.projectStatusTransition.deleteMany({
    where: { projectId, weekStartDate: weekStart },
  });
  return { success: true };
}
