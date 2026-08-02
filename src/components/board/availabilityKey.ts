// src/components/board/availabilityKey.ts
//
// Availability state is keyed `${employeeId}-${day}-${dayPart}`. employeeId
// (cuid, alphanumeric only) and day names never contain a dash, and dayPart
// values use underscores, so matching the trailing `-${day}-${dayPart}`
// against the known day/dayPart lists is unambiguous.
//
// Relative imports (not the "~/..." alias) so this module can be loaded
// directly by `node --experimental-strip-types` in tests, matching boardIds.ts.

import { DAYS } from "../../lib/constants.ts";
import type { DayName } from "../../lib/constants.ts";
import type { DayPart } from "../../types/index.ts";

const DAY_PARTS: DayPart[] = ["full_day", "pre_lunch", "after_lunch"];

export const availabilityKey = (employeeId: string, day: string, dayPart: DayPart): string =>
  `${employeeId}-${day}-${dayPart}`;

export const parseAvailabilityKey = (
  key: string,
): { employeeId: string; day: DayName; dayPart: DayPart } | null => {
  for (const day of DAYS) {
    for (const dayPart of DAY_PARTS) {
      const suffix = `-${day}-${dayPart}`;
      if (key.endsWith(suffix)) {
        return { employeeId: key.slice(0, -suffix.length), day, dayPart };
      }
    }
  }
  return null;
};
