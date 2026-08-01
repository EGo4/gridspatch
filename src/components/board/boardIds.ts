// src/components/board/boardIds.ts
//
// Encoding/decoding for the draggable and droppable IDs used across the board.
// Pulled out of BoardClient.tsx so the ID scheme can be unit-tested without React.
// Never hand-assemble these strings elsewhere — always go through these helpers.

// Relative imports (not the "~/..." alias) so this module can be loaded directly
// by `node --experimental-strip-types` in tests, matching week.ts / board.ts.
import { DAYS } from "../../lib/constants.ts";
import type { DayPart } from "../../types/index.ts";

/**
 * Encode a draggable ID.
 * Format: `${employeeId}::${day}::${dayPart}`
 */
export const getDraggableId = (employeeId: string, day: string, dayPart: DayPart) =>
  `${employeeId}::${day}::${dayPart}`;

export const parseFromDraggableId = (id: string): { employeeId: string; day: string; dayPart: DayPart } => {
  const [employeeId = "", day = "", dayPart = "full_day"] = id.split("::");
  return { employeeId, day, dayPart: dayPart as DayPart };
};

/**
 * Strip the `-pre` / `-post` suffix to get the base droppable ID,
 * then extract the day name from it.
 */
export const getDayFromDroppableId = (droppableId: string): string => {
  const stripped = droppableId.replace(/-(pre|post)$/, "");
  if (stripped.startsWith("pool-")) return stripped.replace("pool-", "");
  return DAYS.find((day) => stripped.endsWith(`-${day}`)) ?? "";
};

/** Extract the projectId from a droppable ID (null for pool droppables). */
export const getProjectIdFromDroppableId = (droppableId: string): string | null => {
  const stripped = droppableId.replace(/-(pre|post)$/, "");
  if (stripped.startsWith("pool-")) return null;
  const day = DAYS.find((d) => stripped.endsWith(`-${d}`));
  if (!day) return null;
  return stripped.slice(0, -(day.length + 1));
};

/** Determine which DayPart a droppable represents from its suffix. */
export const getDayPartFromDroppableId = (droppableId: string): DayPart => {
  if (droppableId.endsWith("-pre")) return "pre_lunch";
  if (droppableId.endsWith("-post")) return "after_lunch";
  return "full_day";
};

// Droppable IDs — project cells
export const fullDayDroppableId    = (projectId: string, day: string) => `${projectId}-${day}`;
export const preLunchDroppableId   = (projectId: string, day: string) => `${projectId}-${day}-pre`;
export const afterLunchDroppableId = (projectId: string, day: string) => `${projectId}-${day}-post`;

// Droppable IDs — pool (full-day only, no split section)
export const poolFullDayId = (day: string) => `pool-${day}`;
