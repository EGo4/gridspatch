"use server";

import { db } from "~/server/db";

export async function updateAssignment(
  employeeId: string,
  projectId: string | null,
  dateIsoString: string,
  weekId: string,
) {
  const date = new Date(dateIsoString);
  const assignmentDb = db as typeof db & {
    assignment: {
      deleteMany: (args: {
        where: {
          employeeId: string;
          date: Date;
        };
      }) => Promise<unknown>;
      upsert: (args: {
        where: {
          employeeId_date: {
            employeeId: string;
            date: Date;
          };
        };
        update: {
          projectId: string | null;
          weekId: string;
        };
        create: {
          employeeId: string;
          projectId: string | null;
          date: Date;
          weekId: string;
        };
      }) => Promise<unknown>;
    };
  };

  if (!projectId) {
    await assignmentDb.assignment.deleteMany({
      where: {
        employeeId,
        date,
      },
    });

    return { success: true };
  }

  await assignmentDb.assignment.upsert({
    where: {
      employeeId_date: {
        employeeId,
        date,
      },
    },
    update: {
      projectId,
      weekId,
    },
    create: {
      employeeId,
      projectId,
      date,
      weekId,
    },
  });

  return { success: true };
}
