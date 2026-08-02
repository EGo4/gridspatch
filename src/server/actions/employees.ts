"use server";

import { z } from "zod";
import { db } from "~/server/db";
import { requireSession } from "~/server/better-auth/roles";
import { zDateIso, zEmployeeRole, zId } from "~/server/validation";
import { normalizeRoleFreeText } from "~/lib/roles";

const zInitials = z.string().trim().min(1).max(10);
const zEmployeeName = z.string().trim().min(1).max(200);

const employeeSchema = z.object({
  name: zEmployeeName,
  initials: zInitials,
  img: z.string().trim().max(2000).nullable().optional(),
  role: zEmployeeRole,
  startDate: zDateIso.nullable().optional(),
  endDate: zDateIso.nullable().optional(),
});

export async function createEmployee(input: {
  name: string;
  initials: string;
  img?: string | null;
  role?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  await requireSession();
  const parsed = employeeSchema.parse(input);
  const employee = await db.employee.create({
    data: {
      name: parsed.name,
      initials: parsed.initials.toUpperCase(),
      img: parsed.img?.trim() ?? null,
      role: parsed.role ?? null,
      startDate: parsed.startDate ? new Date(parsed.startDate) : null,
      endDate: parsed.endDate ? new Date(parsed.endDate) : null,
    },
  });
  return { id: employee.id };
}

export async function updateEmployee(input: {
  id: string;
  name: string;
  initials: string;
  img?: string | null;
  role?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  await requireSession();
  const parsed = employeeSchema.extend({ id: zId }).parse(input);
  await db.employee.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      initials: parsed.initials.toUpperCase(),
      img: parsed.img?.trim() ?? null,
      role: parsed.role ?? null,
      startDate: parsed.startDate ? new Date(parsed.startDate) : null,
      endDate: parsed.endDate ? new Date(parsed.endDate) : null,
    },
  });
  return { success: true };
}

export async function deleteEmployee(id: string) {
  await requireSession();
  const parsedId = zId.parse(id);
  await db.employee.delete({ where: { id: parsedId } });
  return { success: true };
}

// Bulk import (paste list / JSON re-import) can still carry free text — e.g.
// re-importing an export taken before this feature shipped. Normalised
// case-insensitively onto a known role key the same way the one-off
// migration does (scripts/normalize-employee-roles.ts); anything
// unrecognised becomes "no role" rather than rejecting the whole row.
const bulkEmployeeItemSchema = z.object({
  name: zEmployeeName,
  initials: zInitials,
  role: z.string().trim().max(200).nullable().optional(),
});

export async function bulkCreateEmployees(
  items: Array<{ name: string; initials: string; role?: string | null }>,
): Promise<{ created: number; errors: number }> {
  await requireSession();
  let created = 0;
  let errors = 0;
  for (const rawItem of items) {
    const result = bulkEmployeeItemSchema.safeParse(rawItem);
    if (!result.success) {
      errors++;
      continue;
    }
    const item = result.data;
    try {
      await db.employee.create({
        data: {
          name: item.name,
          initials: item.initials.toUpperCase(),
          role: normalizeRoleFreeText(item.role),
        },
      });
      created++;
    } catch {
      errors++;
    }
  }
  return { created, errors };
}
