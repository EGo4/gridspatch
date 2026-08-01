// src/components/board/hooks/useAvailability.ts
//
// Sick/vacation state for the board. Marking an employee unavailable removes
// them from every cell for that day; clearing it returns them to the pool.

import { useState } from "react";
import { getDayFromDroppableId, poolFullDayId } from "../boardIds";
import type { AvailabilityStatus, EmployeeEntry } from "../types";
import type { DayName } from "~/lib/constants";
import type { Employee } from "~/types";
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

  const markAvailability = (employeeId: string, day: string, status: AvailabilityStatus) => {
    confirmPastEdit(() => {
      setAvailability((prev) => ({ ...prev, [`${employeeId}-${day}`]: status }));
      setAssignmentsState((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (getDayFromDroppableId(key) === day) {
            next[key] = (next[key] ?? []).filter((e) => e.employee.id !== employeeId);
          }
        }
        return next;
      });
      setOpenCardId(null);
      const dateIso = weekDates[day as DayName];
      if (dateIso) {
        enqueue("persistAvailability", () => persistAvailability(employeeId, dateIso, weekId, status));
      }
    });
  };

  const clearAvailability = (employeeId: string, day: string) => {
    const employee = dbEmployees.find((e) => e.id === employeeId);
    confirmPastEdit(() => {
      setAvailability((prev) => { const next = { ...prev }; delete next[`${employeeId}-${day}`]; return next; });
      if (employee) {
        setAssignmentsState((prev) => ({
          ...prev,
          [poolFullDayId(day)]: [...(prev[poolFullDayId(day)] ?? []), { employee, dayPart: "full_day" }],
        }));
      }
      const dateIso = weekDates[day as DayName];
      if (dateIso) enqueue("unpersistAvailability", () => unpersistAvailability(employeeId, dateIso));
    });
  };

  return { availability, setAvailability, markAvailability, clearAvailability };
}
