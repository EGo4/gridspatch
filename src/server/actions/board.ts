// src/server/actions/board.ts
"use server";

import { db } from "~/server/db";

export async function updateAssignment(
    employeeId: string,
    projectId: string | null,
    dateIsoString: string
) {
    const date = new Date(dateIsoString);

    await db.assignment.upsert({
        where: {
            employeeId_date: {
                employeeId: employeeId,
                date: date,
            },
        },
        update: {
            projectId: projectId,
        },
        create: {
            employeeId: employeeId,
            projectId: projectId,
            date: date,
        },
    });

    return { success: true };
}