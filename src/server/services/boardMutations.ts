import type { DayPart } from "../../types/index.ts";

type AssignmentRow = {
  employeeId: string;
  projectId: string | null;
  date: Date;
  weekId: string;
  dayPart: DayPart;
};

type AvailabilityRow = {
  employeeId: string;
  date: Date;
  weekId: string;
  dayPart: DayPart;
  status: string;
};

type HolidayRow = {
  date: Date;
  type: string;
};

export type BoardMutationDb = {
  assignment: {
    findMany: (args: { where: Record<string, unknown> }) => Promise<AssignmentRow[]>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
    upsert: (args: {
      where: { employeeId_date_dayPart: { employeeId: string; date: Date; dayPart: DayPart } };
      update: { projectId: string | null; weekId: string };
      create: AssignmentRow;
    }) => Promise<AssignmentRow>;
    createMany: (args: { data: AssignmentRow[]; skipDuplicates: true }) => Promise<{ count: number }>;
  };
  availability: {
    findMany: (args: { where: Record<string, unknown> }) => Promise<AvailabilityRow[]>;
    upsert: (args: {
      where: { employeeId_date_dayPart: { employeeId: string; date: Date; dayPart: DayPart } };
      update: { status: "sick" | "vacation" | "school"; weekId: string };
      create: AvailabilityRow;
    }) => Promise<AvailabilityRow>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
  };
  holiday: {
    upsert: (args: {
      where: { date: Date };
      update: { type: "public_holiday" | "company_holiday" };
      create: HolidayRow;
    }) => Promise<HolidayRow>;
    delete: (args: { where: { date: Date } }) => Promise<HolidayRow>;
  };
};

export async function updateAssignment(
  database: BoardMutationDb,
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
  dayPart: DayPart = "full_day",
) {
  const date = new Date(dateIsoString);

  try {
    if (!projectId) {
      await database.assignment.deleteMany({
        where: { employeeId, date, dayPart },
      });
      return { success: true };
    }

    // When creating a half-day assignment, remove any conflicting full_day assignment.
    if (dayPart !== "full_day") {
      await database.assignment.deleteMany({
        where: { employeeId, date, dayPart: "full_day" },
      });
    }

    await database.assignment.upsert({
      where: {
        employeeId_date_dayPart: { employeeId, date, dayPart },
      },
      update: { projectId, weekId },
      create: { employeeId, projectId, date, weekId, dayPart },
    });

    return { success: true };
  } catch (err) {
    console.error("[boardMutations:updateAssignment]", { employeeId, projectId, dateIsoString, weekId, dayPart }, err);
    throw err;
  }
}

/**
 * Convert a full-day assignment into pre_lunch + after_lunch for the same project.
 * Called when the user clicks the split button on a card that is in a project cell.
 */
export async function splitAssignment(
  database: BoardMutationDb,
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
) {
  const date = new Date(dateIsoString);

  try {
    // Remove the full_day assignment.
    await database.assignment.deleteMany({
      where: { employeeId, date, dayPart: "full_day" },
    });

    if (!projectId) {
      // Employee was in pool — splitting is purely client-side, nothing to persist yet.
      return { success: true };
    }

    // Create both halves in the same project.
    await database.assignment.createMany({
      data: [
        { employeeId, projectId, date, weekId, dayPart: "pre_lunch" },
        { employeeId, projectId, date, weekId, dayPart: "after_lunch" },
      ],
      skipDuplicates: true,
    });

    return { success: true };
  } catch (err) {
    console.error("[boardMutations:splitAssignment]", { employeeId, projectId, dateIsoString, weekId }, err);
    throw err;
  }
}

/**
 * Merge both half-day assignments back into a single full-day assignment.
 * Deletes pre_lunch + after_lunch for the employee/date, then upserts full_day
 * in the provided project (or just removes if no project given).
 */
export async function mergeAssignment(
  database: BoardMutationDb,
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
) {
  const date = new Date(dateIsoString);

  try {
    await database.assignment.deleteMany({ where: { employeeId, date, dayPart: "pre_lunch" } });
    await database.assignment.deleteMany({ where: { employeeId, date, dayPart: "after_lunch" } });

    if (!projectId) return { success: true };

    await database.assignment.upsert({
      where: { employeeId_date_dayPart: { employeeId, date, dayPart: "full_day" } },
      update: { projectId, weekId },
      create: { employeeId, projectId, date, weekId, dayPart: "full_day" },
    });

    return { success: true };
  } catch (err) {
    console.error("[boardMutations:mergeAssignment]", { employeeId, projectId, dateIsoString, weekId }, err);
    throw err;
  }
}

/**
 * Record a sick/vacation absence for a day or half-day.
 *
 * full_day: clears every assignment for the date (any dayPart) and any
 * half-day absence records, then records a single full_day row — a full-day
 * absence always wins outright.
 *
 * pre_lunch/after_lunch: clears only that half's own assignment. A full_day
 * assignment on the same date is not deleted — it's converted into the
 * *other* half (same project kept) since that half is still workable. If the
 * other half already carries the same status, the two half-day records
 * collapse into a single full_day one (and that half's assignment, if any
 * survived from a prior partial absence, is cleared too).
 */
export async function setAvailability(
  database: BoardMutationDb,
  employeeId: string,
  dateIso: string,
  weekId: string,
  status: "sick" | "vacation" | "school",
  dayPart: DayPart = "full_day",
) {
  const date = new Date(dateIso);

  try {
    if (dayPart === "full_day") {
      await database.assignment.deleteMany({ where: { employeeId, date } });
      await database.availability.deleteMany({
        where: { employeeId, date, dayPart: { in: ["pre_lunch", "after_lunch"] } },
      });
      await database.availability.upsert({
        where: { employeeId_date_dayPart: { employeeId, date, dayPart: "full_day" } },
        update: { status, weekId },
        create: { employeeId, date, weekId, status, dayPart: "full_day" },
      });
      return { success: true };
    }

    const otherHalf: DayPart = dayPart === "pre_lunch" ? "after_lunch" : "pre_lunch";

    await database.assignment.deleteMany({ where: { employeeId, date, dayPart } });

    // A full_day assignment survives as the other half instead of being lost.
    const [fullDayAssignment] = await database.assignment.findMany({
      where: { employeeId, date, dayPart: "full_day" },
    });
    if (fullDayAssignment) {
      await database.assignment.deleteMany({ where: { employeeId, date, dayPart: "full_day" } });
      await database.assignment.upsert({
        where: { employeeId_date_dayPart: { employeeId, date, dayPart: otherHalf } },
        update: { projectId: fullDayAssignment.projectId, weekId },
        create: { employeeId, projectId: fullDayAssignment.projectId, date, weekId, dayPart: otherHalf },
      });
    }

    // A half-day absence never coexists with a full_day one.
    await database.availability.deleteMany({ where: { employeeId, date, dayPart: "full_day" } });

    const [otherHalfAvailability] = await database.availability.findMany({
      where: { employeeId, date, dayPart: otherHalf },
    });

    if (otherHalfAvailability?.status === status) {
      // Both halves now share the same status — collapse into one full_day
      // record, and drop whatever assignment survived the first half-mark.
      await database.assignment.deleteMany({ where: { employeeId, date } });
      await database.availability.deleteMany({
        where: { employeeId, date, dayPart: { in: ["pre_lunch", "after_lunch"] } },
      });
      await database.availability.upsert({
        where: { employeeId_date_dayPart: { employeeId, date, dayPart: "full_day" } },
        update: { status, weekId },
        create: { employeeId, date, weekId, status, dayPart: "full_day" },
      });
    } else {
      await database.availability.upsert({
        where: { employeeId_date_dayPart: { employeeId, date, dayPart } },
        update: { status, weekId },
        create: { employeeId, date, weekId, status, dayPart },
      });
    }

    return { success: true };
  } catch (err) {
    console.error("[boardMutations:setAvailability]", { employeeId, dateIso, weekId, status, dayPart }, err);
    throw err;
  }
}

export async function clearAvailability(
  database: BoardMutationDb,
  employeeId: string,
  dateIso: string,
  dayPart: DayPart = "full_day",
) {
  const date = new Date(dateIso);
  try {
    await database.availability.deleteMany({ where: { employeeId, date, dayPart } });
    return { success: true };
  } catch (err) {
    console.error("[boardMutations:clearAvailability]", { employeeId, dateIso, dayPart }, err);
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
  database: BoardMutationDb,
  sourceWeekId: string,
  targetWeekId: string,
  sourceWeekStartIso: string,
  targetWeekStartIso: string,
) {
  const offsetMs =
    new Date(targetWeekStartIso).getTime() - new Date(sourceWeekStartIso).getTime();

  try {
    const sourceAssignments = await database.assignment.findMany({
      where: { weekId: sourceWeekId, NOT: { projectId: null } },
    });

    await database.assignment.deleteMany({
      where: { weekId: targetWeekId, NOT: { projectId: null } },
    });

    if (sourceAssignments.length > 0) {
      await database.assignment.createMany({
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
    console.error("[boardMutations:copyWeekAssignments]", { sourceWeekId, targetWeekId }, err);
    throw err;
  }
}

export async function clearProjectAssignmentsForWeek(database: BoardMutationDb, projectId: string, weekId: string) {
  try {
    await database.assignment.deleteMany({ where: { projectId, weekId } });
    return { success: true };
  } catch (err) {
    console.error("[boardMutations:clearProjectAssignmentsForWeek]", { projectId, weekId }, err);
    throw err;
  }
}

export async function setHoliday(
  database: BoardMutationDb,
  dateIso: string,
  weekId: string,
  type: "public_holiday" | "company_holiday",
  employeeIds: string[],
) {
  const date = new Date(dateIso);

  try {
    await database.holiday.upsert({
      where: { date },
      update: { type },
      create: { date, type },
    });

    await database.assignment.deleteMany({ where: { date } });

    if (type === "company_holiday") {
      await database.availability.deleteMany({
        where: { date, dayPart: { in: ["pre_lunch", "after_lunch"] } },
      });
      for (const employeeId of employeeIds) {
        await database.availability.upsert({
          where: { employeeId_date_dayPart: { employeeId, date, dayPart: "full_day" } },
          update: { status: "vacation", weekId },
          create: { employeeId, date, weekId, status: "vacation", dayPart: "full_day" },
        });
      }
    } else {
      await database.availability.deleteMany({ where: { date } });
    }

    return { success: true };
  } catch (err) {
    console.error("[boardMutations:setHoliday]", { dateIso, weekId, type }, err);
    throw err;
  }
}

export async function clearHoliday(
  database: BoardMutationDb,
  dateIso: string,
  previousType: "public_holiday" | "company_holiday",
) {
  const date = new Date(dateIso);

  try {
    await database.holiday.delete({ where: { date } });

    if (previousType === "company_holiday") {
      await database.availability.deleteMany({ where: { date } });
    }

    return { success: true };
  } catch (err) {
    console.error("[boardMutations:clearHoliday]", { dateIso, previousType }, err);
    throw err;
  }
}

/**
 * Copy one day's project assignments onto another day.
 *
 * `projectIds`, when given, scopes both the read and the delete to just
 * those sites (site-selective day copy) — assignments on unselected sites
 * are left untouched. When omitted, every site is copied (the original,
 * unrestricted behaviour); `copySiteDayAssignments` below is the
 * single-project special case of this same scoping.
 *
 * A scoped copy can leave assignments on *unselected* sites in place on the
 * target day, so a copied row can collide with one of those, or with an
 * absence — `createMany({ skipDuplicates: true })` would silently keep the
 * stale row and drop the copy with no signal. Every source row is checked
 * against what remains on the target day (other sites' assignments +
 * availability) after the scoped delete, and conflicting employees are
 * skipped rather than stolen from wherever they already are; the caller
 * gets the skipped count back to surface to the planner.
 *
 * Same treatment for an employee split across two *different* sites on the
 * source day (pre_lunch at one, after_lunch at the other): copying just one
 * of those two sites would place them there for that half and leave the
 * other half with no record anywhere on the target day. Both halves are
 * skipped together unless both sites are part of this copy.
 */
export async function copyDayAssignments(
  database: BoardMutationDb,
  sourceDateIso: string,
  targetDateIso: string,
  weekId: string,
  projectIds?: string[],
) {
  const sourceDate = new Date(sourceDateIso);
  const targetDate = new Date(targetDateIso);
  const scopeFilter = projectIds ? { projectId: { in: projectIds } } : { NOT: { projectId: null } };

  try {
    const sourceAssignments = await database.assignment.findMany({
      where: { date: sourceDate, weekId, ...scopeFilter },
    });

    // Only a *scoped* copy can half-select a split pair — an unrestricted
    // copy always includes every site, so this check is skipped entirely
    // (and the extra query avoided) when projectIds is omitted.
    const stranded = new Set<string>();
    if (projectIds) {
      const allSourceAssignments = await database.assignment.findMany({
        where: { date: sourceDate, weekId, NOT: { projectId: null } },
      });
      const splitPair = new Map<string, { pre?: string | null; post?: string | null }>();
      for (const a of allSourceAssignments) {
        if (a.dayPart !== "pre_lunch" && a.dayPart !== "after_lunch") continue;
        const rec = splitPair.get(a.employeeId) ?? {};
        if (a.dayPart === "pre_lunch") rec.pre = a.projectId; else rec.post = a.projectId;
        splitPair.set(a.employeeId, rec);
      }
      for (const [employeeId, rec] of splitPair.entries()) {
        if (rec.pre && rec.post && rec.pre !== rec.post && projectIds.includes(rec.pre) !== projectIds.includes(rec.post)) {
          stranded.add(employeeId);
        }
      }
    }

    await database.assignment.deleteMany({
      where: { date: targetDate, weekId, ...scopeFilter },
    });

    let skipped = 0;
    if (sourceAssignments.length > 0) {
      const [remainingTargetAssignments, targetAvailability] = await Promise.all([
        database.assignment.findMany({ where: { date: targetDate, weekId } }),
        database.availability.findMany({ where: { date: targetDate } }),
      ]);

      // employeeId -> every dayPart already occupying them on the target day
      // (leftover assignments on other sites, plus absences); "full_day"
      // blocks everything and is blocked by anything.
      const occupied = new Map<string, Set<DayPart>>();
      const occupy = (employeeId: string, dayPart: DayPart) => {
        const set = occupied.get(employeeId) ?? new Set<DayPart>();
        set.add(dayPart);
        occupied.set(employeeId, set);
      };
      remainingTargetAssignments.forEach((a) => occupy(a.employeeId, a.dayPart));
      targetAvailability.forEach((av) => occupy(av.employeeId, av.dayPart));

      const isBlocked = (employeeId: string, dayPart: DayPart): boolean => {
        const set = occupied.get(employeeId);
        if (!set || set.size === 0) return false;
        return dayPart === "full_day" || set.has("full_day") || set.has(dayPart);
      };

      const toInsert: AssignmentRow[] = [];
      for (const a of sourceAssignments) {
        if (stranded.has(a.employeeId) || isBlocked(a.employeeId, a.dayPart)) {
          skipped++;
          continue;
        }
        occupy(a.employeeId, a.dayPart);
        toInsert.push({ employeeId: a.employeeId, projectId: a.projectId, date: targetDate, weekId, dayPart: a.dayPart });
      }

      if (toInsert.length > 0) {
        await database.assignment.createMany({ data: toInsert, skipDuplicates: true });
      }
    }

    return { success: true, skipped };
  } catch (err) {
    console.error("[boardMutations:copyDayAssignments]", { sourceDateIso, targetDateIso, weekId, projectIds }, err);
    throw err;
  }
}

/** Single-site special case of copyDayAssignments — fills one site's target-day cell from another day. */
export async function copySiteDayAssignments(
  database: BoardMutationDb,
  projectId: string,
  sourceDateIso: string,
  targetDateIso: string,
  weekId: string,
) {
  return copyDayAssignments(database, sourceDateIso, targetDateIso, weekId, [projectId]);
}
