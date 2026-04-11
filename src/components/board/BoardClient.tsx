// src/components/board/BoardClient.tsx
"use client";

import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { updateAssignment } from "~/server/actions/board";
import { DAYS, DAY_DATES } from "~/lib/constants";
import { EmployeeCard } from "./EmployeeCard";
import type { Employee, Project, Assignment } from "~/types";

interface BoardClientProps {
    dbProjects: Project[];
    dbEmployees: Employee[];
    dbAssignments: Assignment[];
}

export function BoardClient({ dbProjects, dbEmployees, dbAssignments }: BoardClientProps) {
    const [assignmentsState, setAssignmentsState] = useState<Record<string, Employee[]>>({});
    const [activeDay, setActiveDay] = useState("Monday");
    const [isLoaded, setIsLoaded] = useState(false);

    const getDayFromDroppableId = (droppableId: string) => {
        if (droppableId.startsWith("pool-")) {
            return droppableId.replace("pool-", "");
        }

        return DAYS.find(day => droppableId.endsWith(`-${day}`)) ?? "";
    };

    const getDraggableId = (employeeId: string, day: string) => `${employeeId}::${day}`;
    const getEmployeeIdFromDraggableId = (draggableId: string) => draggableId.split("::")[0] ?? draggableId;

    useEffect(() => {
        const initialState: Record<string, Employee[]> = {};

        dbProjects.forEach(p => DAYS.forEach(d => initialState[`${p.id}-${d}`] = []));
        DAYS.forEach(d => initialState[`pool-${d}`] = [...dbEmployees]);

        dbAssignments.forEach(assignment => {
            const dayName = (Object.entries(DAY_DATES) as Array<[string, string]>).find(
                ([, dateIso]) => new Date(dateIso).getTime() === assignment.date.getTime()
            );

            if (!dayName) return;
            const [resolvedDayName] = dayName;
            const employee = dbEmployees.find(e => e.id === assignment.employeeId);
            if (!employee) return;

            const poolId = `pool-${resolvedDayName}`;
            initialState[poolId] = (initialState[poolId] ?? []).filter(e => e.id !== employee.id);

            if (assignment.projectId) {
                const cellId = `${assignment.projectId}-${resolvedDayName}`;
                if (initialState[cellId]) {
                    initialState[cellId].push(employee);
                }
            }
        });

        setAssignmentsState(initialState);
        setIsLoaded(true);
    }, [dbProjects, dbEmployees, dbAssignments]);

    const onDragEnd = async (result: DropResult) => {
        const { source, destination, draggableId } = result;
        if (!destination) return;

        const sourceDay = getDayFromDroppableId(source.droppableId);
        const destinationDay = getDayFromDroppableId(destination.droppableId);

        if (!sourceDay || !destinationDay || sourceDay !== destinationDay) {
            return;
        }

        const sourceList = [...(assignmentsState[source.droppableId] ?? [])];
        const destList = [...(assignmentsState[destination.droppableId] ?? [])];
        const [removed] = sourceList.splice(source.index, 1);
        if (!removed) return;

        if (source.droppableId === destination.droppableId) {
            sourceList.splice(destination.index, 0, removed);
            setAssignmentsState({ ...assignmentsState, [source.droppableId]: sourceList });
            return;
        }

        destList.splice(destination.index, 0, removed);
        setAssignmentsState({
            ...assignmentsState,
            [source.droppableId]: sourceList,
            [destination.droppableId]: destList,
        });

        let targetProjectId: string | null = null;
        let targetDay = "";

        if (destination.droppableId.startsWith("pool-")) {
            targetDay = destination.droppableId.replace("pool-", "");
        } else {
            const daySuffix = DAYS.find(d => destination.droppableId.endsWith(d));
            if (daySuffix) {
                targetDay = daySuffix;
                targetProjectId = destination.droppableId.replace(`-${daySuffix}`, "");
            }
        }

        const targetDateIso = DAY_DATES[targetDay];
        if (targetDateIso) {
            await updateAssignment(getEmployeeIdFromDraggableId(draggableId), targetProjectId, targetDateIso);
        }
    };

    if (!isLoaded) return <div className="p-10 text-white">Loading board...</div>;

    return (
        <div className="min-h-screen bg-[#1f1e24] text-[#ececef] font-sans flex flex-col lg:flex-row">
            <main className="flex-1 overflow-x-auto p-4 flex flex-col">
                {/* Mobile View Toggles */}
                <div className="lg:hidden flex overflow-x-auto gap-2 mb-6 pb-2">
                    {DAYS.map(day => (
                        <button
                            key={day}
                            onClick={() => setActiveDay(day)}
                            className={`px-4 py-2 rounded-full text-sm font-medium ${activeDay === day ? "bg-blue-600 text-white" : "bg-[#28272d] text-[#a09fa6]"
                                }`}
                        >
                            {day}
                        </button>
                    ))}
                </div>

                <DragDropContext onDragEnd={onDragEnd}>
                    <div className="w-full lg:min-w-max flex flex-col gap-4">

                        <div className="flex gap-4">
                            {DAYS.map(day => (
                                <div key={day} className={`w-full lg:w-80 flex-shrink-0 bg-[#28272d] rounded-md p-2.5 font-semibold text-sm ${day === activeDay ? 'flex' : 'hidden'} lg:flex`}>
                                    {day}
                                </div>
                            ))}
                        </div>

                        {dbProjects.map(project => (
                            <div key={project.id} className="flex flex-col gap-2">
                                <div className="text-sm font-semibold py-1">{project.name}</div>
                                <div className="flex gap-4 items-stretch">
                                    {DAYS.map(day => {
                                        const cellId = `${project.id}-${day}`;
                                        return (
                                            <Droppable key={cellId} droppableId={cellId} type={day}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.droppableProps}
                                                        className={`w-full lg:w-80 flex-shrink-0 min-h-[60px] rounded-md p-2.5 flex-col gap-2.5 border ${day === activeDay ? 'flex' : 'hidden'} lg:flex ${snapshot.isDraggingOver ? "bg-[#333238] border-[#5a5961]" : "bg-[#28272d] border-[#313036]"}`}
                                                    >
                                                        {assignmentsState[cellId]?.map((emp, index) => (
                                                            <EmployeeCard
                                                                key={`${emp.id}-${day}`}
                                                                employee={emp}
                                                                index={index}
                                                                draggableId={getDraggableId(emp.id, day)}
                                                            />
                                                        ))}
                                                        {provided.placeholder}
                                                    </div>
                                                )}
                                            </Droppable>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        <div className="flex flex-col gap-2 mt-6">
                            <div className="text-sm font-semibold py-1 text-blue-400">Pool (Available)</div>
                            <div className="flex gap-4 items-stretch">
                                {DAYS.map(day => {
                                    const poolId = `pool-${day}`;
                                    return (
                                        <Droppable key={poolId} droppableId={poolId} type={day}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.droppableProps}
                                                    className={`w-full lg:w-80 flex-shrink-0 min-h-[60px] rounded-md p-2.5 flex-col gap-2.5 border border-dashed ${day === activeDay ? 'flex' : 'hidden'} lg:flex ${snapshot.isDraggingOver ? "bg-[#333238]" : "border-[#4a4950]"}`}
                                                >
                                                    {assignmentsState[poolId]?.map((emp, index) => (
                                                        <EmployeeCard
                                                            key={`${emp.id}-${day}`}
                                                            employee={emp}
                                                            index={index}
                                                            draggableId={getDraggableId(emp.id, day)}
                                                        />
                                                    ))}
                                                    {provided.placeholder}
                                                </div>
                                            )}
                                        </Droppable>
                                    );
                                })}
                            </div>
                        </div>

                    </div>
                </DragDropContext>
            </main>
        </div>
    );
}
