// src/components/board/hooks/useHolidays.ts
//
// Public/company holiday state and persistence for the board. A holiday
// clears the whole day (every project cell and the pool); a company holiday
// additionally marks every employee vacation for that day.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { poolFullDayId, poolHalfDayId } from "../boardIds";
import { availabilityKey, parseAvailabilityKey } from "../availabilityKey";
import type { AvailabilityStatus, EmployeeEntry } from "../types";
import type { DayName } from "~/lib/constants";
import type { Employee, Holiday, HolidayType } from "~/types";
import { setHoliday as persistHoliday, clearHoliday as unpersistHoliday } from "~/server/actions/board";

type UseHolidaysArgs = {
  dbHolidays: Holiday[];
  dbEmployees: Employee[];
  weekDates: Record<DayName, string>;
  weekId: string;
  enqueue: (label: string, run: () => Promise<unknown>) => void;
  setAssignmentsState: React.Dispatch<React.SetStateAction<Record<string, EmployeeEntry[]>>>;
  setAvailability: React.Dispatch<React.SetStateAction<Record<string, AvailabilityStatus>>>;
};

export function useHolidays({
  dbHolidays,
  dbEmployees,
  weekDates,
  weekId,
  enqueue,
  setAssignmentsState,
  setAvailability,
}: UseHolidaysArgs) {
  const router = useRouter();

  const [holidays, setHolidays] = useState<Record<string, HolidayType>>(() => {
    const map: Record<string, HolidayType> = {};
    for (const h of dbHolidays) map[h.dateIso] = h.type;
    return map;
  });
  const [holidayPopoverDay, setHolidayPopoverDay] = useState<string | null>(null);

  const getHolidayType = (day: string): HolidayType | null => {
    const dateIso = weekDates[day as DayName];
    return dateIso ? (holidays[dateIso] ?? null) : null;
  };
  const isPublicHoliday = (day: string) => getHolidayType(day) === "public_holiday";

  const applyHoliday = (day: string, type: HolidayType) => {
    const dateIso = weekDates[day as DayName];
    if (!dateIso) return;

    setHolidays((prev) => ({ ...prev, [dateIso]: type }));

    if (type === "company_holiday") {
      // Clear all project assignments for this day + move everyone to vacation
      setAssignmentsState((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (key.includes(`-${day}`) && !key.startsWith("pool-")) next[key] = [];
        }
        next[poolFullDayId(day)] = [];
        next[poolHalfDayId(day)] = [];
        return next;
      });
      setAvailability((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          const parsed = parseAvailabilityKey(key);
          if (parsed?.day === day) delete next[key];
        }
        for (const emp of dbEmployees) next[availabilityKey(emp.id, day, "full_day")] = "vacation";
        return next;
      });
      const employeeIds = dbEmployees.map((e) => e.id);
      enqueue("setHoliday", () => persistHoliday(dateIso, weekId, type, employeeIds).then(() => router.refresh()));
    } else {
      // public_holiday: clear assignments + availability for this day
      setAssignmentsState((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (key.includes(`-${day}`)) next[key] = [];
        }
        return next;
      });
      setAvailability((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          const parsed = parseAvailabilityKey(key);
          if (parsed?.day === day) delete next[key];
        }
        return next;
      });
      enqueue("setHoliday", () => persistHoliday(dateIso, weekId, type, []).then(() => router.refresh()));
    }
  };

  const removeHoliday = (day: string) => {
    const dateIso = weekDates[day as DayName];
    if (!dateIso) return;
    const previousType = holidays[dateIso];
    if (!previousType) return;

    setHolidays((prev) => { const next = { ...prev }; delete next[dateIso]; return next; });

    if (previousType === "company_holiday") {
      setAvailability((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          const parsed = parseAvailabilityKey(key);
          if (parsed?.day === day) delete next[key];
        }
        return next;
      });
    }

    enqueue("clearHoliday", () => unpersistHoliday(dateIso, previousType).then(() => router.refresh()));
  };

  return {
    holidays,
    holidayPopoverDay,
    setHolidayPopoverDay,
    getHolidayType,
    isPublicHoliday,
    applyHoliday,
    removeHoliday,
  };
}
