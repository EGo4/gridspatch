// src/server/validation.ts
//
// Shared Zod primitives for server-action input. Every exported function in
// a "use server" file is its own callable endpoint regardless of which page
// imports it (see the "use server" note in CLAUDE.md), so parsing happens at
// the action boundary itself, not deeper in the service/mutation layer.

import { z } from "zod";
import { ROLE_KEYS } from "~/lib/roles";

/**
 * A DB id. Loosely validated (non-empty, bounded) rather than locked to
 * Prisma's cuid() shape — Better Auth's own adapter generates User ids
 * through its own id generator, not Prisma's default, so a strict cuid()
 * check would risk rejecting legitimate ids.
 */
export const zId = z.string().trim().min(1).max(191);

/**
 * An ISO date(-time) string that `new Date()` can actually parse. Every
 * board/service call does `new Date(dateIsoString)` with no check of its
 * own — an unparseable string becomes `Invalid Date`, which reaches Prisma
 * as a malformed value instead of failing cleanly here.
 */
export const zDateIso = z
  .string()
  .trim()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

/** A bare `YYYY-MM-DD` date param, matching `toDateParam()` in lib/week.ts. */
export const zDateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Expected YYYY-MM-DD" });

export const zDayPart = z.enum(["full_day", "pre_lunch", "after_lunch"]);
export const zAvailabilityStatus = z.enum(["sick", "vacation", "school"]);
/** Nullable/optional — "no role" is a valid, common employee state. */
export const zEmployeeRole = z.enum(ROLE_KEYS).nullable().optional();
export const zHolidayType = z.enum(["public_holiday", "company_holiday"]);
export const zProjectStatus = z.enum(["planned", "active", "on_hold", "done", "inactive"]);
export const zUserRole = z.enum(["construction_manager", "hr", "admin"]);
export const zLocale = z.enum(["en", "de"]);
export const zTheme = z.enum(["dark", "light"]);

/**
 * Matches exactly what `<input type="color">` produces in ProfileClient.
 * These values are embedded into a `<style>` tag via dangerouslySetInnerHTML
 * in layout.tsx (see the CSS custom properties block) — anything looser is a
 * stored CSS/markup injection vector into every page the owning user loads.
 */
export const zHexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: "Must be a #rrggbb hex colour" });

export const zName = z.string().trim().min(1).max(200);
export const zEmail = z.string().trim().min(1).max(320).email();
export const zShortText = z.string().trim().max(2000);
