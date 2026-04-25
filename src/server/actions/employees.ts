"use server";

import { db } from "~/server/db";

type EmployeeDb = {
  employee: {
    findMany: (args: { orderBy: { name: "asc" } }) => Promise<
      Array<{
        id: string;
        name: string;
        initials: string;
        img: string | null;
        role: string | null;
        startDate: Date | null;
        endDate: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>
    >;
    create: (args: {
      data: {
        name: string;
        initials: string;
        img?: string | null;
        role?: string | null;
        startDate?: Date | null;
        endDate?: Date | null;
      };
    }) => Promise<{ id: string }>;
    update: (args: {
      where: { id: string };
      data: {
        name?: string;
        initials?: string;
        img?: string | null;
        role?: string | null;
        startDate?: Date | null;
        endDate?: Date | null;
      };
    }) => Promise<{ id: string }>;
    delete: (args: { where: { id: string } }) => Promise<{ id: string }>;
  };
};

const empDb = db as unknown as EmployeeDb;

export async function createEmployee(input: {
  name: string;
  initials: string;
  img?: string | null;
  role?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const employee = await empDb.employee.create({
    data: {
      name: input.name.trim(),
      initials: input.initials.trim().toUpperCase(),
      img: input.img?.trim() || null,
      role: input.role?.trim() || null,
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
  await empDb.employee.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      initials: input.initials.trim().toUpperCase(),
      img: input.img?.trim() || null,
      role: input.role?.trim() || null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
    },
  });
  return { success: true };
}

export async function deleteEmployee(id: string) {
  await empDb.employee.delete({ where: { id } });
  return { success: true };
}

export async function bulkCreateEmployees(
  items: Array<{ name: string; initials: string; role?: string | null }>,
): Promise<{ created: number; errors: number }> {
  let created = 0;
  let errors = 0;
  for (const item of items) {
    try {
      await empDb.employee.create({
        data: {
          name: item.name.trim(),
          initials: item.initials.trim().toUpperCase(),
          role: item.role?.trim() || null,
        },
      });
      created++;
    } catch {
      errors++;
    }
  }
  return { created, errors };
}
