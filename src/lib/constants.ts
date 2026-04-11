// src/lib/constants.ts

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Mapping days to actual ISO date strings for database storage
export const DAY_DATES: Record<string, string> = {
    "Monday": "2026-04-13T00:00:00.000Z",
    "Tuesday": "2026-04-14T00:00:00.000Z",
    "Wednesday": "2026-04-15T00:00:00.000Z",
    "Thursday": "2026-04-16T00:00:00.000Z",
    "Friday": "2026-04-17T00:00:00.000Z",
};