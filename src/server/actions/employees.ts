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
      };
    }) => Promise<{ id: string }>;
    update: (args: {
      where: { id: string };
      data: {
        name?: string;
        initials?: string;
        img?: string | null;
        role?: string | null;
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
}) {
  const employee = await empDb.employee.create({
    data: {
      name: input.name.trim(),
      initials: input.initials.trim().toUpperCase(),
      img: input.img?.trim() || null,
      role: input.role?.trim() || null,
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
}) {
  await empDb.employee.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      initials: input.initials.trim().toUpperCase(),
      img: input.img?.trim() || null,
      role: input.role?.trim() || null,
    },
  });
  return { success: true };
}

export async function deleteEmployee(id: string) {
  await empDb.employee.delete({ where: { id } });
  return { success: true };
}
