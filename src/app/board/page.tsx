// src/app/board/page.tsx
import { db } from "~/server/db";
import { BoardClient } from "~/components/board/BoardClient";

export default async function BoardPage() {
    // Fetch initial data securely on the server
    const projects = await db.project.findMany();
    const employees = await db.employee.findMany();
    const assignments = await db.assignment.findMany();

    return (
        <BoardClient
            dbProjects={projects}
            dbEmployees={employees}
            dbAssignments={assignments}
        />
    );
}