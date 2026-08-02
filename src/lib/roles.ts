// src/lib/roles.ts
//
// Employee roles are a known, closed key list rather than free text (see
// FEATURE_ROADMAP.md "Apprentice role and school days"). The DB column
// (Employee.role) stays a plain String — Zod enforces this key list at the
// action boundary (zEmployeeRole in validation.ts) instead of a Prisma enum,
// so adding a role later is a one-line change here, not a migration.
//
// Display labels are NOT here — every user-visible string goes through
// next-intl (see CLAUDE.md). EmployeesClient.tsx maps each key to a message
// key under the "Employees" namespace ("roleApprentice", "roleStaff").
//
// Intentionally limited to two keys for now: "apprentice" (required by the
// school-days feature) and "staff" (everyone else — Vorarbeiter, Maurer,
// Elektrikerin, Tiefbau, and any other trade found in production data all
// fold into this single generic role). See
// scripts/normalize-employee-roles.ts for the one-off migration that maps
// existing free text onto these two keys.

export const ROLE_KEYS = ["apprentice", "staff"] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const isRoleKey = (value: string): value is RoleKey => (ROLE_KEYS as readonly string[]).includes(value);

/**
 * Case-insensitive free-text → key lookup, used only by the one-off
 * normalisation migration (scripts/normalize-employee-roles.ts) and
 * bulkCreateEmployees (list/JSON import can carry role text from an export
 * predating this migration). The admin form itself only ever sends a
 * RoleKey once this ships, so nothing else needs this. These are data-
 * matching literals, not displayed UI strings — "Azubi" is the common short
 * form of "Auszubildender" (apprentice); the various trade names below
 * ("Vorarbeiter", "Maurer", "Elektrikerin", "Tiefbau", …) all fold onto
 * "staff" now that roles are limited to just apprentice/staff.
 */
const FREE_TEXT_LOOKUP: Record<string, RoleKey> = {
  apprentice: "apprentice",
  lehrling: "apprentice",
  azubi: "apprentice",
  auszubildender: "apprentice",
  staff: "staff",
  angestellter: "staff",
  angestellte: "staff",
  mitarbeiter: "staff",
  employee: "staff",
  foreman: "staff",
  vorarbeiter: "staff",
  bricklayer: "staff",
  maurer: "staff",
  electrician: "staff",
  elektriker: "staff",
  elektrikerin: "staff",
  groundworker: "staff",
  tiefbau: "staff",
};

export const normalizeRoleFreeText = (raw: string | null | undefined): RoleKey | null => {
  if (!raw) return null;
  return FREE_TEXT_LOOKUP[raw.trim().toLowerCase()] ?? null;
};
