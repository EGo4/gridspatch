"use server";

import { z } from "zod";
import { db } from "~/server/db";
import { requireSession } from "~/server/better-auth/roles";
import { zDateIso, zId } from "~/server/validation";

const zInitials = z.string().trim().min(1).max(10);
const zEmployeeName = z.string().trim().min(1).max(200);
const zRole = z.string().trim().max(200).nullable().optional();

const employeeSchema = z.object({
  name: zEmployeeName,
  initials: zInitials,
  img: z.string().trim().max(2000).nullable().optional(),
  role: zRole,
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
      role: parsed.role?.trim() ?? null,
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
      role: parsed.role?.trim() ?? null,
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

const bulkEmployeeItemSchema = z.object({
  name: zEmployeeName,
  initials: zInitials,
  role: zRole,
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
          role: item.role?.trim() ?? null,
        },
      });
      created++;
    } catch {
      errors++;
    }
  }
  return { created, errors };
}
