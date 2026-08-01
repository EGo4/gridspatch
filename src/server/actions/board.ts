"use server";

import { db } from "~/server/db";
import * as mutations from "~/server/services/boardMutations";
import type { DayPart } from "~/types";

export async function updateAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
  dayPart: DayPart = "full_day",
) {
  return mutations.updateAssignment(db, employeeId, projectId, dateIsoString, weekId, dayPart);
}

export async function splitAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
) {
  return mutations.splitAssignment(db, employeeId, projectId, dateIsoString, weekId);
}

export async function mergeAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
) {
  return mutations.mergeAssignment(db, employeeId, projectId, dateIsoString, weekId);
}

export async function setAvailability(
  employeeId: string,
  dateIso: string,
  weekId: string,
  status: "sick" | "vacation",
) {
  return mutations.setAvailability(db, employeeId, dateIso, weekId, status);
}

export async function clearAvailability(employeeId: string, dateIso: string) {
  return mutations.clearAvailability(db, employeeId, dateIso);
}

export async function copyWeekAssignments(
  sourceWeekId: string,
  targetWeekId: string,
  sourceWeekStartIso: string,
  targetWeekStartIso: string,
) {
  return mutations.copyWeekAssignments(db, sourceWeekId, targetWeekId, sourceWeekStartIso, targetWeekStartIso);
}

export async function clearProjectAssignmentsForWeek(projectId: string, weekId: string) {
  return mutations.clearProjectAssignmentsForWeek(db, projectId, weekId);
}

export async function setHoliday(
  dateIso: string,
  weekId: string,
  type: "public_holiday" | "company_holiday",
  employeeIds: string[],
) {
  return mutations.setHoliday(db, dateIso, weekId, type, employeeIds);
}

export async function clearHoliday(
  dateIso: string,
  previousType: "public_holiday" | "company_holiday",
) {
  return mutations.clearHoliday(db, dateIso, previousType);
}

export async function copyDayAssignments(
  sourceDateIso: string,
  targetDateIso: string,
  weekId: string,
) {
  return mutations.copyDayAssignments(db, sourceDateIso, targetDateIso, weekId);
}
