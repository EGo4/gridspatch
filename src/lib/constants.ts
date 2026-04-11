// src/lib/constants.ts

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

export type DayName = (typeof DAYS)[number];
