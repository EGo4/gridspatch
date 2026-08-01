"use server";

import { z } from "zod";
import { db } from "~/server/db";
import * as mutations from "~/server/services/boardMutations";
import type { DayPart } from "~/types";
import { requireSession } from "~/server/better-auth/roles";
import { zAvailabilityStatus, zDateIso, zHolidayType, zId } from "~/server/validation";

// requireSession() on every export, unlike most action files. See the
// board.ts note in CLAUDE.md: middleware now only checks cookie presence
// (spoofable), so this is the actual authentication for board mutations —
// not defense-in-depth on top of a real middleware check like elsewhere.

export async function updateAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
  dayPart: DayPart = "full_day",
) {
  await requireSession();
  employeeId = zId.parse(employeeId);
  projectId = zId.nullable().parse(projectId);
  dateIsoString = zDateIso.parse(dateIsoString);
  weekId = zId.parse(weekId);
  dayPart = z.enum(["full_day", "pre_lunch", "after_lunch"]).parse(dayPart);
  return mutations.updateAssignment(db, employeeId, projectId, dateIsoString, weekId, dayPart);
}

export async function splitAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
) {
  await requireSession();
  employeeId = zId.parse(employeeId);
  projectId = zId.nullable().parse(projectId);
  dateIsoString = zDateIso.parse(dateIsoString);
  weekId = zId.parse(weekId);
  return mutations.splitAssignment(db, employeeId, projectId, dateIsoString, weekId);
}

export async function mergeAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
) {
  await requireSession();
  employeeId = zId.parse(employeeId);
  projectId = zId.nullable().parse(projectId);
  dateIsoString = zDateIso.parse(dateIsoString);
  weekId = zId.parse(weekId);
  return mutations.mergeAssignment(db, employeeId, projectId, dateIsoString, weekId);
}

export async function setAvailability(
  employeeId: string,
  dateIso: string,
  weekId: string,
  status: "sick" | "vacation",
) {
  await requireSession();
  employeeId = zId.parse(employeeId);
  dateIso = zDateIso.parse(dateIso);
  weekId = zId.parse(weekId);
  status = zAvailabilityStatus.parse(status);
  return mutations.setAvailability(db, employeeId, dateIso, weekId, status);
}

export async function clearAvailability(employeeId: string, dateIso: string) {
  await requireSession();
  employeeId = zId.parse(employeeId);
  dateIso = zDateIso.parse(dateIso);
  return mutations.clearAvailability(db, employeeId, dateIso);
}

export async function copyWeekAssignments(
  sourceWeekId: string,
  targetWeekId: string,
  sourceWeekStartIso: string,
  targetWeekStartIso: string,
) {
  await requireSession();
  sourceWeekId = zId.parse(sourceWeekId);
  targetWeekId = zId.parse(targetWeekId);
  sourceWeekStartIso = zDateIso.parse(sourceWeekStartIso);
  targetWeekStartIso = zDateIso.parse(targetWeekStartIso);
  return mutations.copyWeekAssignments(db, sourceWeekId, targetWeekId, sourceWeekStartIso, targetWeekStartIso);
}

export async function clearProjectAssignmentsForWeek(projectId: string, weekId: string) {
  await requireSession();
  projectId = zId.parse(projectId);
  weekId = zId.parse(weekId);
  return mutations.clearProjectAssignmentsForWeek(db, projectId, weekId);
}

export async function setHoliday(
  dateIso: string,
  weekId: string,
  type: "public_holiday" | "company_holiday",
  employeeIds: string[],
) {
  await requireSession();
  dateIso = zDateIso.parse(dateIso);
  weekId = zId.parse(weekId);
  type = zHolidayType.parse(type);
  employeeIds = z.array(zId).parse(employeeIds);
  return mutations.setHoliday(db, dateIso, weekId, type, employeeIds);
}

export async function clearHoliday(
  dateIso: string,
  previousType: "public_holiday" | "company_holiday",
) {
  await requireSession();
  dateIso = zDateIso.parse(dateIso);
  previousType = zHolidayType.parse(previousType);
  return mutations.clearHoliday(db, dateIso, previousType);
}

export async function copyDayAssignments(
  sourceDateIso: string,
  targetDateIso: string,
  weekId: string,
) {
  await requireSession();
  sourceDateIso = zDateIso.parse(sourceDateIso);
  targetDateIso = zDateIso.parse(targetDateIso);
  weekId = zId.parse(weekId);
  return mutations.copyDayAssignments(db, sourceDateIso, targetDateIso, weekId);
}
