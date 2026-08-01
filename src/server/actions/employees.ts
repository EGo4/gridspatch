"use server";

import { db } from "~/server/db";
import { requireSession } from "~/server/better-auth/roles";

export async function createEmployee(input: {
  name: string;
  initials: string;
  img?: string | null;
  role?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  await requireSession();
  const employee = await db.employee.create({
    data: {
      name: input.name.trim(),
      initials: input.initials.trim().toUpperCase(),
      img: input.img?.trim() ?? null,
      role: input.role?.trim() ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
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
  await db.employee.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      initials: input.initials.trim().toUpperCase(),
      img: input.img?.trim() ?? null,
      role: input.role?.trim() ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
    },
  });
  return { success: true };
}

export async function deleteEmployee(id: string) {
  await requireSession();
  await db.employee.delete({ where: { id } });
  return { success: true };
}

export async function bulkCreateEmployees(
  items: Array<{ name: string; initials: string; role?: string | null }>,
): Promise<{ created: number; errors: number }> {
  await requireSession();
  let created = 0;
  let errors = 0;
  for (const item of items) {
    try {
      await db.employee.create({
        data: {
          name: item.name.trim(),
          initials: item.initials.trim().toUpperCase(),
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
