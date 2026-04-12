"use server";

import { db } from "~/server/db";
import type { DayPart } from "~/types";

// Manual type shim until the generated Prisma client catches up after migration.
type AssignmentDb = typeof db & {
  assignment: {
    deleteMany: (args: {
      where: { employeeId: string; date: Date; dayPart?: string };
    }) => Promise<unknown>;
    upsert: (args: {
      where: { employeeId_date_dayPart: { employeeId: string; date: Date; dayPart: string } };
      update: { projectId: string | null; weekId: string };
      create: {
        employeeId: string;
        projectId: string | null;
        date: Date;
        weekId: string;
        dayPart: string;
      };
    }) => Promise<unknown>;
    createMany: (args: {
      data: Array<{
        employeeId: string;
        projectId: string | null;
        date: Date;
        weekId: string;
        dayPart: string;
      }>;
      skipDuplicates?: boolean;
    }) => Promise<unknown>;
  };
};

export async function updateAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
  dayPart: DayPart = "full_day",
) {
  const date = new Date(dateIsoString);
  const assignmentDb = db as unknown as AssignmentDb;

  if (!projectId) {
    await assignmentDb.assignment.deleteMany({
      where: { employeeId, date, dayPart },
    });
    return { success: true };
  }

  // When creating a half-day assignment, remove any conflicting full_day assignment.
  if (dayPart !== "full_day") {
    await assignmentDb.assignment.deleteMany({
      where: { employeeId, date, dayPart: "full_day" },
    });
  }

  await assignmentDb.assignment.upsert({
    where: {
      employeeId_date_dayPart: { employeeId, date, dayPart },
    },
    update: { projectId, weekId },
    create: { employeeId, projectId, date, weekId, dayPart },
  });

  return { success: true };
}

/**
 * Convert a full-day assignment into pre_lunch + after_lunch for the same project.
 * Called when the user clicks the split button on a card that is in a project cell.
 */
export async function splitAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
) {
  const date = new Date(dateIsoString);
  const assignmentDb = db as unknown as AssignmentDb;

  // Remove the full_day assignment.
  await assignmentDb.assignment.deleteMany({
    where: { employeeId, date, dayPart: "full_day" },
  });

  if (!projectId) {
    // Employee was in pool — splitting is purely client-side, nothing to persist yet.
    return { success: true };
  }

  // Create both halves in the same project.
  await assignmentDb.assignment.createMany({
    data: [
      { employeeId, projectId, date, weekId, dayPart: "pre_lunch" },
      { employeeId, projectId, date, weekId, dayPart: "after_lunch" },
    ],
    skipDuplicates: true,
  });

  return { success: true };
}

/**
 * Merge both half-day assignments back into a single full-day assignment.
 * Deletes pre_lunch + after_lunch for the employee/date, then upserts full_day
 * in the provided project (or just removes if no project given).
 */
export async function mergeAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
) {
  const date = new Date(dateIsoString);
  const assignmentDb = db as unknown as AssignmentDb;

  await assignmentDb.assignment.deleteMany({ where: { employeeId, date, dayPart: "pre_lunch" } });
  await assignmentDb.assignment.deleteMany({ where: { employeeId, date, dayPart: "after_lunch" } });

  if (!projectId) return { success: true };

  await assignmentDb.assignment.upsert({
    where: { employeeId_date_dayPart: { employeeId, date, dayPart: "full_day" } },
    update: { projectId, weekId },
    create: { employeeId, projectId, date, weekId, dayPart: "full_day" },
  });

  return { success: true };
}
