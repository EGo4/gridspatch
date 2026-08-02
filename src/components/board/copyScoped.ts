// src/components/board/copyScoped.ts
//
// Pure optimistic-state logic shared by both site-selective day-copy
// variants (a multi-site dialog and a single-site cell control) — both end
// up calling this with a different `projectIds` list. Only cells for those
// projects are touched; assignments on every other site are left alone.
//
// A scoped copy can leave assignments on *unselected* sites in place on the
// target day, so a copied employee can collide with one of those, or with
// an absence. Rather than silently overwriting or dropping them, conflicting
// employees are skipped and counted — mirrors the server-side skip rule in
// boardMutations.ts's copyDayAssignments exactly, so the optimistic UI
// matches what actually gets persisted.
//
// Same treatment for an employee split across two *different* sites on the
// source day (AM at site A, PM at site B): copying only one of those sites
// would place them there for that half and leave the other half with no
// record anywhere on the target day — not on a site, not in the pool either,
// since they're no longer free. Both halves are skipped together unless
// both sites are part of this copy.
//
// Relative imports (not the "~/..." alias) so this module can be loaded
// directly by `node --experimental-strip-types` in tests, matching
// poolMerge.ts / boardIds.ts.

import {
  fullDayDroppableId,
  preLunchDroppableId,
  afterLunchDroppableId,
  poolFullDayId,
  getDayFromDroppableId,
  getProjectIdFromDroppableId,
} from "./boardIds.ts";
import { parseAvailabilityKey } from "./availabilityKey.ts";
import type { DayPart, Employee, Project } from "../../types/index.ts";

type EmployeeEntry = { employee: Employee; dayPart: DayPart };
type AssignmentsState = Record<string, EmployeeEntry[]>;

export type ScopedCopyResult = { state: AssignmentsState; skipped: number };

const cellId = (projectId: string, day: string, dayPart: DayPart): string =>
  dayPart === "pre_lunch"
    ? preLunchDroppableId(projectId, day)
    : dayPart === "after_lunch"
      ? afterLunchDroppableId(projectId, day)
      : fullDayDroppableId(projectId, day);

export const applyScopedDayCopy = (
  prev: AssignmentsState,
  dbProjects: Project[],
  dbEmployees: Employee[],
  availability: Record<string, unknown>,
  projectIds: string[],
  sourceDay: string,
  targetDay: string,
): ScopedCopyResult => {
  const next: AssignmentsState = { ...prev };
  let skipped = 0;

  // 1. Clear target cells for just the selected projects.
  projectIds.forEach((id) => {
    next[fullDayDroppableId(id, targetDay)] = [];
    next[preLunchDroppableId(id, targetDay)] = [];
    next[afterLunchDroppableId(id, targetDay)] = [];
  });

  // 2. What already occupies employees on the target day outside the
  // selected projects (other sites' assignments + absences).
  const occupied = new Map<string, Set<DayPart>>();
  const occupy = (employeeId: string, dayPart: DayPart) => {
    const set = occupied.get(employeeId) ?? new Set<DayPart>();
    set.add(dayPart);
    occupied.set(employeeId, set);
  };
  Object.keys(next).forEach((id) => {
    if (getDayFromDroppableId(id) !== targetDay || id.startsWith("pool-")) return;
    const cellProjectId = getProjectIdFromDroppableId(id);
    if (cellProjectId && projectIds.includes(cellProjectId)) return; // just cleared above, not "occupying"
    (next[id] ?? []).forEach((e) => occupy(e.employee.id, e.dayPart));
  });
  Object.keys(availability).forEach((key) => {
    const parsed = parseAvailabilityKey(key);
    if (parsed?.day === targetDay) occupy(parsed.employeeId, parsed.dayPart);
  });

  const isBlocked = (employeeId: string, dayPart: DayPart): boolean => {
    const set = occupied.get(employeeId);
    if (!set || set.size === 0) return false;
    return dayPart === "full_day" || set.has("full_day") || set.has(dayPart);
  };

  // Employees split across two different sites on the source day — if only
  // one of those two sites is in this copy, both halves are skipped rather
  // than stranding the other one. Looked up across every project (not just
  // the selected ones) so the pairing is visible regardless of scope.
  const splitPair = new Map<string, { pre?: string; post?: string }>();
  dbProjects.forEach((project) => {
    (prev[cellId(project.id, sourceDay, "pre_lunch")] ?? []).forEach((e) => {
      const rec = splitPair.get(e.employee.id) ?? {};
      rec.pre = project.id;
      splitPair.set(e.employee.id, rec);
    });
    (prev[cellId(project.id, sourceDay, "after_lunch")] ?? []).forEach((e) => {
      const rec = splitPair.get(e.employee.id) ?? {};
      rec.post = project.id;
      splitPair.set(e.employee.id, rec);
    });
  });
  const stranded = new Set<string>();
  splitPair.forEach((rec, employeeId) => {
    if (rec.pre && rec.post && rec.pre !== rec.post && projectIds.includes(rec.pre) !== projectIds.includes(rec.post)) {
      stranded.add(employeeId);
    }
  });

  // 3. Copy each selected project's cells, skipping blocked/stranded employees.
  const DAY_PARTS: DayPart[] = ["full_day", "pre_lunch", "after_lunch"];
  projectIds.forEach((id) => {
    DAY_PARTS.forEach((dayPart) => {
      const sourceEntries = prev[cellId(id, sourceDay, dayPart)] ?? [];
      const kept: EmployeeEntry[] = [];
      sourceEntries.forEach((entry) => {
        if (stranded.has(entry.employee.id) || isBlocked(entry.employee.id, dayPart)) {
          skipped++;
          return;
        }
        occupy(entry.employee.id, dayPart);
        kept.push(entry);
      });
      next[cellId(id, targetDay, dayPart)] = kept;
    });
  });

  // 4. Rebuild the pool for the target day: anyone not in a project cell and
  // not absent goes back to the pool (mirrors the unrestricted day copy).
  const assignedInTarget = new Set<string>();
  dbProjects.forEach((project) => {
    DAY_PARTS.forEach((dayPart) => {
      (next[cellId(project.id, targetDay, dayPart)] ?? []).forEach((e) => assignedInTarget.add(e.employee.id));
    });
  });

  const unavailableInTarget = new Set(
    Object.keys(availability)
      .map((key) => parseAvailabilityKey(key))
      .filter((parsed) => parsed !== null && parsed.day === targetDay)
      .map((parsed) => parsed!.employeeId),
  );

  next[poolFullDayId(targetDay)] = dbEmployees
    .filter((e) => !assignedInTarget.has(e.id) && !unavailableInTarget.has(e.id))
    .map((e) => ({ employee: e, dayPart: "full_day" as DayPart }));

  return { state: next, skipped };
};
