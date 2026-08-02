// src/components/board/hooks/useAvailability.ts
//
// Sick/vacation state for the board, full-day or half-day. Marking a half
// absent removes only that half's own cell entry; a full_day cell entry for
// the same employee/day survives as the *other* half (site or pool kept)
// instead of being wiped like a full-day absence does. Marking both halves
// with the same status collapses them into a single full-day entry, mirroring
// the server-side collapse in boardMutations.ts.

import { useState } from "react";
import {
  getDayFromDroppableId,
  getProjectIdFromDroppableId,
  poolFullDayId,
  preLunchDroppableId,
  afterLunchDroppableId,
} from "../boardIds";
import { availabilityKey } from "../availabilityKey";
import { addHalfToPool } from "../poolMerge";
import type { AvailabilityStatus, EmployeeEntry } from "../types";
import type { DayName } from "~/lib/constants";
import type { DayPart, Employee } from "~/types";
import { setAvailability as persistAvailability, clearAvailability as unpersistAvailability } from "~/server/actions/board";

type UseAvailabilityArgs = {
  dbEmployees: Employee[];
  weekDates: Record<DayName, string>;
  weekId: string;
  enqueue: (label: string, run: () => Promise<unknown>) => void;
  confirmPastEdit: (action: () => void | Promise<void>) => void;
  setAssignmentsState: React.Dispatch<React.SetStateAction<Record<string, EmployeeEntry[]>>>;
  setOpenCardId: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useAvailability({
  dbEmployees,
  weekDates,
  weekId,
  enqueue,
  confirmPastEdit,
  setAssignmentsState,
  setOpenCardId,
}: UseAvailabilityArgs) {
  const [availability, setAvailability] = useState<Record<string, AvailabilityStatus>>({});

  const markAvailability = (
    employeeId: string,
    day: string,
    status: AvailabilityStatus,
    dayPart: DayPart = "full_day",
  ) => {
    const employee = dbEmployees.find((e) => e.id === employeeId);
    confirmPastEdit(() => {
      const otherHalf: DayPart = dayPart === "pre_lunch" ? "after_lunch" : "pre_lunch";
      const collapses =
        dayPart !== "full_day" && availability[availabilityKey(employeeId, day, otherHalf)] === status;
      const effectiveDayPart: DayPart = collapses ? "full_day" : dayPart;

      setAvailability((prev) => {
        const next = { ...prev };
        delete next[availabilityKey(employeeId, day, "full_day")];
        if (effectiveDayPart === "full_day") {
          // Collapsing into (or directly marking) a full-day absence — neither
          // half-day record survives it.
          delete next[availabilityKey(employeeId, day, "pre_lunch")];
          delete next[availabilityKey(employeeId, day, "after_lunch")];
        }
        next[availabilityKey(employeeId, day, effectiveDayPart)] = status;
        return next;
      });

      setAssignmentsState((prev) => {
        let next = { ...prev };

        if (effectiveDayPart === "full_day") {
          for (const key of Object.keys(next)) {
            if (getDayFromDroppableId(key) === day) {
              next[key] = (next[key] ?? []).filter((e) => e.employee.id !== employeeId);
            }
          }
          return next;
        }

        // Remove this employee's entry for the half being marked absent (if
        // any), and convert a surviving full_day entry into the other half
        // instead of deleting it — same project (or pool) is kept.
        let convertedProjectId: string | null | undefined;
        for (const key of Object.keys(next)) {
          if (getDayFromDroppableId(key) !== day) continue;
          const entries = next[key] ?? [];
          const hasHalf = entries.some((e) => e.employee.id === employeeId && e.dayPart === effectiveDayPart);
          if (hasHalf) {
            next[key] = entries.filter((e) => !(e.employee.id === employeeId && e.dayPart === effectiveDayPart));
            continue;
          }
          const fullIdx = entries.findIndex((e) => e.employee.id === employeeId && e.dayPart === "full_day");
          if (fullIdx !== -1 && convertedProjectId === undefined) {
            convertedProjectId = getProjectIdFromDroppableId(key);
            next[key] = entries.filter((_, i) => i !== fullIdx);
          }
        }
        if (convertedProjectId !== undefined && employee) {
          if (convertedProjectId) {
            const targetId = otherHalf === "pre_lunch"
              ? preLunchDroppableId(convertedProjectId, day)
              : afterLunchDroppableId(convertedProjectId, day);
            next[targetId] = [...(next[targetId] ?? []), { employee, dayPart: otherHalf }];
          } else {
            // Was a full_day pool card — the surviving half goes back as a
            // half-day pool card, merging with its sibling if one's already free there.
            next = addHalfToPool(next, day, employee, otherHalf);
          }
        }
        return next;
      });

      setOpenCardId(null);
      const dateIso = weekDates[day as DayName];
      if (dateIso) {
        enqueue("persistAvailability", () => persistAvailability(employeeId, dateIso, weekId, status, dayPart));
      }
    });
  };

  const clearAvailability = (employeeId: string, day: string, dayPart: DayPart = "full_day") => {
    const employee = dbEmployees.find((e) => e.id === employeeId);
    confirmPastEdit(() => {
      setAvailability((prev) => { const next = { ...prev }; delete next[availabilityKey(employeeId, day, dayPart)]; return next; });
      if (employee) {
        if (dayPart === "full_day") {
          setAssignmentsState((prev) => ({
            ...prev,
            [poolFullDayId(day)]: [...(prev[poolFullDayId(day)] ?? []), { employee, dayPart }],
          }));
        } else {
          setAssignmentsState((prev) => addHalfToPool(prev, day, employee, dayPart));
        }
      }
      const dateIso = weekDates[day as DayName];
      if (dateIso) enqueue("unpersistAvailability", () => unpersistAvailability(employeeId, dateIso, dayPart));
    });
  };

  return { availability, setAvailability, markAvailability, clearAvailability };
}
