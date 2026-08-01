// src/components/board/types.ts
//
// UI-only types shared across BoardClient and its extracted hooks. Domain
// types that mirror the DB shape live in ~/types instead.

import type { DayPart, Employee } from "~/types";

export type AvailabilityStatus = "sick" | "vacation";

export type EmployeeEntry = {
  employee: Employee;
  dayPart: DayPart;
};

export type SitePickerTarget = {
  employeeId: string;
  day: string;
  sourceCellId: string;
  left: number;
  top: number;
};
