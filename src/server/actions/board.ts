"use server";

import { db } from "~/server/db";
import type { DayPart } from "~/types";

export async function updateAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
  dayPart: DayPart = "full_day",
) {
  const date = new Date(dateIsoString);

  try {
    if (!projectId) {
      await db.assignment.deleteMany({
        where: { employeeId, date, dayPart },
      });
      return { success: true };
    }

    // When creating a half-day assignment, remove any conflicting full_day assignment.
    if (dayPart !== "full_day") {
      await db.assignment.deleteMany({
        where: { employeeId, date, dayPart: "full_day" },
      });
    }

    await db.assignment.upsert({
      where: {
        employeeId_date_dayPart: { employeeId, date, dayPart },
      },
      update: { projectId, weekId },
      create: { employeeId, projectId, date, weekId, dayPart },
    });

    return { success: true };
  } catch (err) {
    console.error("[action:updateAssignment]", { employeeId, projectId, dateIsoString, weekId, dayPart }, err);
    throw err;
  }
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

  try {
    // Remove the full_day assignment.
    await db.assignment.deleteMany({
      where: { employeeId, date, dayPart: "full_day" },
    });

    if (!projectId) {
      // Employee was in pool — splitting is purely client-side, nothing to persist yet.
      return { success: true };
    }

    // Create both halves in the same project.
    await db.assignment.createMany({
      data: [
        { employeeId, projectId, date, weekId, dayPart: "pre_lunch" },
        { employeeId, projectId, date, weekId, dayPart: "after_lunch" },
      ],
      skipDuplicates: true,
    });

    return { success: true };
  } catch (err) {
    console.error("[action:splitAssignment]", { employeeId, projectId, dateIsoString, weekId }, err);
    throw err;
  }
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

  try {
    await db.assignment.deleteMany({ where: { employeeId, date, dayPart: "pre_lunch" } });
    await db.assignment.deleteMany({ where: { employeeId, date, dayPart: "after_lunch" } });

    if (!projectId) return { success: true };

    await db.assignment.upsert({
      where: { employeeId_date_dayPart: { employeeId, date, dayPart: "full_day" } },
      update: { projectId, weekId },
      create: { employeeId, projectId, date, weekId, dayPart: "full_day" },
    });

    return { success: true };
  } catch (err) {
    console.error("[action:mergeAssignment]", { employeeId, projectId, dateIsoString, weekId }, err);
    throw err;
  }
}

/**
 * Copy all project assignments from one day to another within the same week.
 * Overwrites any existing project assignments on the target date.
 * Pool state is not affected.
 */
export async function setAvailability(
  employeeId: string,
  dateIso: string,
  weekId: string,
  status: "sick" | "vacation",
) {
  const date = new Date(dateIso);

  try {
    // Remove any assignments for this day — the employee is unavailable.
    await db.assignment.deleteMany({ where: { employeeId, date } });

    await db.availability.upsert({
      where: { employeeId_date: { employeeId, date } },
      update: { status, weekId },
      create: { employeeId, date, weekId, status },
    });
    return { success: true };
  } catch (err) {
    console.error("[action:setAvailability]", { employeeId, dateIso, weekId, status }, err);
    throw err;
  }
}

export async function clearAvailability(employeeId: string, dateIso: string) {
  const date = new Date(dateIso);
  try {
    await db.availability.deleteMany({ where: { employeeId, date } });
    return { success: true };
  } catch (err) {
    console.error("[action:clearAvailability]", { employeeId, dateIso }, err);
    throw err;
  }
}

/**
 * Copy all project assignments from one week into another.
 * Dates are remapped by day-of-week (source Monday → target Monday, etc.).
 * Existing project assignments in the target week are deleted first.
 * Availability (sick/vacation) is intentionally not copied.
 */
export async function copyWeekAssignments(
  sourceWeekId: string,
  targetWeekId: string,
  sourceWeekStartIso: string,
  targetWeekStartIso: string,
) {
  const offsetMs =
    new Date(targetWeekStartIso).getTime() - new Date(sourceWeekStartIso).getTime();

  try {
    const sourceAssignments = await db.assignment.findMany({
      where: { weekId: sourceWeekId, NOT: { projectId: null } },
    });

    await db.assignment.deleteMany({
      where: { weekId: targetWeekId, NOT: { projectId: null } },
    });

    if (sourceAssignments.length > 0) {
      await db.assignment.createMany({
        data: sourceAssignments.map((a) => ({
          employeeId: a.employeeId,
          projectId: a.projectId,
          date: new Date(a.date.getTime() + offsetMs),
          weekId: targetWeekId,
          dayPart: a.dayPart,
        })),
        skipDuplicates: true,
      });
    }

    return { success: true };
  } catch (err) {
    console.error("[action:copyWeekAssignments]", { sourceWeekId, targetWeekId }, err);
    throw err;
  }
}

export async function clearProjectAssignmentsForWeek(projectId: string, weekId: string) {
  try {
    await db.assignment.deleteMany({ where: { projectId, weekId } });
    return { success: true };
  } catch (err) {
    console.error("[action:clearProjectAssignmentsForWeek]", { projectId, weekId }, err);
    throw err;
  }
}

export async function setHoliday(
  dateIso: string,
  weekId: string,
  type: "public_holiday" | "company_holiday",
  employeeIds: string[],
) {
  const date = new Date(dateIso);

  try {
    await db.holiday.upsert({
      where: { date },
      update: { type },
      create: { date, type },
    });

    await db.assignment.deleteMany({ where: { date } });

    if (type === "company_holiday") {
      for (const employeeId of employeeIds) {
        await db.availability.upsert({
          where: { employeeId_date: { employeeId, date } },
          update: { status: "vacation", weekId },
          create: { employeeId, date, weekId, status: "vacation" },
        });
      }
    } else {
      await db.availability.deleteMany({ where: { date } });
    }

    return { success: true };
  } catch (err) {
    console.error("[action:setHoliday]", { dateIso, weekId, type }, err);
    throw err;
  }
}

export async function clearHoliday(
  dateIso: string,
  previousType: "public_holiday" | "company_holiday",
) {
  const date = new Date(dateIso);

  try {
    await db.holiday.delete({ where: { date } });

    if (previousType === "company_holiday") {
      await db.availability.deleteMany({ where: { date } });
    }

    return { success: true };
  } catch (err) {
    console.error("[action:clearHoliday]", { dateIso, previousType }, err);
    throw err;
  }
}

export async function copyDayAssignments(
  sourceDateIso: string,
  targetDateIso: string,
  weekId: string,
) {
  const sourceDate = new Date(sourceDateIso);
  const targetDate = new Date(targetDateIso);

  try {
    const sourceAssignments = await db.assignment.findMany({
      where: { date: sourceDate, weekId, NOT: { projectId: null } },
    });

    await db.assignment.deleteMany({
      where: { date: targetDate, weekId, NOT: { projectId: null } },
    });

    if (sourceAssignments.length > 0) {
      await db.assignment.createMany({
        data: sourceAssignments.map((a) => ({
          employeeId: a.employeeId,
          projectId: a.projectId,
          date: targetDate,
          weekId,
          dayPart: a.dayPart,
        })),
        skipDuplicates: true,
      });
    }

    return { success: true };
  } catch (err) {
    console.error("[action:copyDayAssignments]", { sourceDateIso, targetDateIso, weekId }, err);
    throw err;
  }
}
