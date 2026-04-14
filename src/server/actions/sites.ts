"use server";

import { db } from "~/server/db";
import type { ProjectStatus } from "~/types";

type SiteDb = {
  project: {
    findMany: () => Promise<
      Array<{
        id: string;
        name: string;
        description: string | null;
        startDate: Date | null;
        endDate: Date | null;
        status: string;
        createdAt: Date;
        updatedAt: Date;
      }>
    >;
    create: (args: {
      data: {
        name: string;
        description?: string | null;
        startDate?: Date | null;
        endDate?: Date | null;
        status: string;
      };
    }) => Promise<{ id: string }>;
    update: (args: {
      where: { id: string };
      data: {
        name?: string;
        description?: string | null;
        startDate?: Date | null;
        endDate?: Date | null;
        status?: string;
      };
    }) => Promise<{ id: string }>;
    delete: (args: { where: { id: string } }) => Promise<{ id: string }>;
  };
};

const siteDb = db as unknown as SiteDb;

export async function createSite(input: {
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: ProjectStatus;
}) {
  const site = await siteDb.project.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      status: input.status,
    },
  });
  return { id: site.id };
}

export async function updateSite(input: {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: ProjectStatus;
}) {
  await siteDb.project.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      status: input.status,
      ...("description" in input && { description: input.description?.trim() ?? null }),
      ...("startDate" in input && { startDate: input.startDate ? new Date(input.startDate) : null }),
      ...("endDate" in input && { endDate: input.endDate ? new Date(input.endDate) : null }),
    },
  });
  return { success: true };
}

export async function deleteSite(id: string) {
  await siteDb.project.delete({ where: { id } });
  return { success: true };
}
