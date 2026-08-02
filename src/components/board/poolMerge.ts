// src/components/board/poolMerge.ts
//
// Adding a free half-day card to the pool needs to check whether the other
// half of the same employee/day is already sitting there as a free half
// card — if so, the two halves collapse into a single full_day pool entry
// instead of stacking two separate half entries for the same person. This
// is a pure client-side view concern: neither half ever has an Assignment
// row while "free" in the pool, so there's nothing to reconcile server-side —
// the rebuild effect (useBoardState.ts) already does the same collapse when
// resyncing from fresh server props, this just keeps the optimistic state
// consistent with that in between.
//
// Relative imports (not the "~/..." alias) so this module can be loaded
// directly by `node --experimental-strip-types` in tests, matching boardIds.ts.

import { poolFullDayId, poolHalfDayId } from "./boardIds.ts";
import type { DayPart, Employee } from "../../types/index.ts";

type EmployeeEntry = { employee: Employee; dayPart: DayPart };
type AssignmentsState = Record<string, EmployeeEntry[]>;

export const addHalfToPool = (
  assignmentsState: AssignmentsState,
  day: string,
  employee: Employee,
  dayPart: "pre_lunch" | "after_lunch",
): AssignmentsState => {
  const halfPoolId = poolHalfDayId(day);
  const otherHalf: DayPart = dayPart === "pre_lunch" ? "after_lunch" : "pre_lunch";
  const halfPool = assignmentsState[halfPoolId] ?? [];
  const hasOtherHalf = halfPool.some((e) => e.employee.id === employee.id && e.dayPart === otherHalf);

  if (hasOtherHalf) {
    const fullPoolId = poolFullDayId(day);
    return {
      ...assignmentsState,
      [halfPoolId]: halfPool.filter((e) => !(e.employee.id === employee.id && e.dayPart === otherHalf)),
      [fullPoolId]: [...(assignmentsState[fullPoolId] ?? []), { employee, dayPart: "full_day" as DayPart }],
    };
  }

  return { ...assignmentsState, [halfPoolId]: [...halfPool, { employee, dayPart }] };
};
