"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import type { DragStart, DropResult } from "@hello-pangea/dnd";

import { EmployeeCard } from "./EmployeeCard";
import { updateAssignment } from "~/server/actions/board";
import { DAYS } from "~/lib/constants";
import {
  getDayNameFromDate,
  getNextWeekParam,
  getPreviousWeekParam,
  getWeekDateMap,
} from "~/lib/week";
import type { Assignment, BoardWeek, Employee, Project } from "~/types";

type AvailabilityStatus = "sick" | "vacation";

interface BoardClientProps {
  dbProjects: Project[];
  dbEmployees: Employee[];
  dbAssignments: Assignment[];
  selectedWeek: BoardWeek;
  weeks: BoardWeek[];
}

export function BoardClient({
  dbProjects,
  dbEmployees,
  dbAssignments,
  selectedWeek,
  weeks,
}: BoardClientProps) {
  const [assignmentsState, setAssignmentsState] = useState<Record<string, Employee[]>>({});
  const [activeDay, setActiveDay] = useState("Monday");
  const [isLoaded, setIsLoaded] = useState(false);
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);
  const [draggingDay, setDraggingDay] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, AvailabilityStatus>>({});
  const [sickVacationCollapsed, setSickVacationCollapsed] = useState(true);
  const weekDates = getWeekDateMap(selectedWeek.startDateIso);

  const getDayFromDroppableId = (droppableId: string) => {
    if (droppableId.startsWith("pool-")) {
      return droppableId.replace("pool-", "");
    }
    return DAYS.find((day) => droppableId.endsWith(`-${day}`)) ?? "";
  };

  const getDraggableId = (employeeId: string, day: string) => `${employeeId}::${day}`;
  const getEmployeeIdFromDraggableId = (draggableId: string) =>
    draggableId.split("::")[0] ?? draggableId;

  useEffect(() => {
    const initialState: Record<string, Employee[]> = {};

    dbProjects.forEach((project) =>
      DAYS.forEach((day) => {
        initialState[`${project.id}-${day}`] = [];
      }),
    );
    DAYS.forEach((day) => {
      initialState[`pool-${day}`] = [...dbEmployees];
    });

    dbAssignments.forEach((assignment) => {
      const resolvedDayName = getDayNameFromDate(assignment.date, selectedWeek.startDateIso);
      if (!resolvedDayName) return;
      const employee = dbEmployees.find((entry) => entry.id === assignment.employeeId);
      if (!employee) return;

      if (assignment.projectId) {
        const poolId = `pool-${resolvedDayName}`;
        initialState[poolId] = (initialState[poolId] ?? []).filter(
          (entry) => entry.id !== employee.id,
        );
        const cellId = `${assignment.projectId}-${resolvedDayName}`;
        if (initialState[cellId]) {
          initialState[cellId].push(employee);
        }
      }
    });

    setAssignmentsState(initialState);
    setIsLoaded(true);
  }, [dbProjects, dbEmployees, dbAssignments, selectedWeek.startDateIso]);

  const toggleOpenCard = (cardId: string) => {
    setOpenCardId((prev) => (prev === cardId ? null : cardId));
  };

  const markAvailability = (employeeId: string, day: string, status: AvailabilityStatus) => {
    setAvailability((prev) => ({ ...prev, [`${employeeId}-${day}`]: status }));
    setAssignmentsState((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next).filter((k) => k.endsWith(`-${day}`))) {
        next[key] = (next[key] ?? []).filter((e) => e.id !== employeeId);
      }
      return next;
    });
    setOpenCardId(null);
  };

  const clearAvailability = (employeeId: string, day: string) => {
    setAvailability((prev) => {
      const next = { ...prev };
      delete next[`${employeeId}-${day}`];
      return next;
    });
    const employee = dbEmployees.find((e) => e.id === employeeId);
    if (employee) {
      setAssignmentsState((prev) => ({
        ...prev,
        [`pool-${day}`]: [...(prev[`pool-${day}`] ?? []), employee],
      }));
    }
  };

  const onDragStart = (start: DragStart) => {
    setDraggingDay(getDayFromDroppableId(start.source.droppableId) || null);
    setOpenCardId(null);
  };

  const onDragEnd = async (result: DropResult) => {
    setDraggingDay(null);
    const { source, destination, draggableId } = result;
    if (!destination) return;

    const sourceDay = getDayFromDroppableId(source.droppableId);
    const destinationDay = getDayFromDroppableId(destination.droppableId);

    if (!sourceDay || !destinationDay || sourceDay !== destinationDay) return;

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
      const daySuffix = DAYS.find((day) => destination.droppableId.endsWith(day));
      if (daySuffix) {
        targetDay = daySuffix;
        targetProjectId = destination.droppableId.replace(`-${daySuffix}`, "");
      }
    }

    const targetDateIso = weekDates[targetDay as keyof typeof weekDates];
    if (targetDateIso) {
      await updateAssignment(
        getEmployeeIdFromDraggableId(draggableId),
        targetProjectId,
        targetDateIso,
        selectedWeek.id,
      );
    }
  };

  if (!isLoaded) return <div className="p-10 text-white">Loading board...</div>;

  return (
    <div className="min-h-screen bg-[#1f1e24] font-sans text-[#ececef] flex flex-col lg:flex-row">
      <main className="flex-1 overflow-x-auto p-4 flex flex-col">

        {/* Week selector */}
        <div className="mb-6 flex items-center justify-center">
          <div className="relative inline-flex items-center rounded-full bg-[#28272d] text-sm font-medium text-[#a09fa6]">
            <Link
              href={`/board?week=${getPreviousWeekParam(selectedWeek.startDateIso)}`}
              className="px-3 py-2 transition hover:text-[#ececef]"
            >
              &#8249;
            </Link>
            <div className="h-4 w-px bg-[#3a3940]" />
            <button
              type="button"
              onClick={() => setWeekDropdownOpen((o) => !o)}
              className="flex items-center gap-1.5 px-4 py-2 text-[#ececef] transition hover:text-white"
            >
              {selectedWeek.label}
              <svg className="h-3 w-3 text-[#8b8893]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="h-4 w-px bg-[#3a3940]" />
            <Link
              href={`/board?week=${getNextWeekParam(selectedWeek.startDateIso)}`}
              className="px-3 py-2 transition hover:text-[#ececef]"
            >
              &#8250;
            </Link>
            {weekDropdownOpen && (
              <div className="absolute top-full left-1/2 z-50 mt-2 min-w-[200px] -translate-x-1/2 overflow-hidden rounded-xl border border-[#313036] bg-[#28272d] shadow-xl">
                {weeks.map((week) => (
                  <Link
                    key={week.id}
                    href={`/board?week=${week.param}`}
                    onClick={() => setWeekDropdownOpen(false)}
                    className={`block px-4 py-2.5 text-sm font-medium transition ${
                      week.id === selectedWeek.id
                        ? "bg-blue-600 text-white"
                        : "text-[#a09fa6] hover:bg-[#333238] hover:text-[#ececef]"
                    }`}
                  >
                    {week.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile day tabs */}
        <div className="lg:hidden flex overflow-x-auto gap-2 mb-6 pb-2">
          {DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setActiveDay(day)}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                activeDay === day ? "bg-blue-600 text-white" : "bg-[#28272d] text-[#a09fa6]"
              }`}
            >
              {day}
            </button>
          ))}
        </div>

        <DragDropContext onDragEnd={onDragEnd} onDragStart={onDragStart}>
          <div className="w-full lg:min-w-max flex flex-col gap-4">

            {/* Day headers */}
            <div className="flex gap-4">
              {DAYS.map((day) => (
                <div
                  key={day}
                  className={`w-full lg:min-w-max lg:flex-1 rounded-md p-2.5 font-semibold text-sm transition-opacity duration-150 ${
                    day === activeDay ? "flex" : "hidden"
                  } lg:flex ${
                    draggingDay && day === draggingDay
                      ? "bg-[#2d3748] text-blue-300 ring-1 ring-inset ring-blue-500/40"
                      : draggingDay
                      ? "bg-[#28272d] opacity-30"
                      : "bg-[#28272d]"
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Project swimlanes */}
            {dbProjects.map((project) => (
              <div key={project.id} className="flex flex-col gap-2">
                <div className="py-1 text-sm font-semibold">{project.name}</div>
                <div className="flex gap-4 items-stretch">
                  {DAYS.map((day) => {
                    const cellId = `${project.id}-${day}`;
                    return (
                      <Droppable key={cellId} droppableId={cellId} type={day}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`w-full lg:min-w-max lg:flex-1 min-h-[60px] rounded-md p-2.5 flex-col gap-2.5 border transition-opacity duration-150 ${
                              day === activeDay ? "flex" : "hidden"
                            } lg:flex ${
                              draggingDay && day !== draggingDay
                                ? "opacity-30 bg-[#28272d] border-[#252428]"
                                : snapshot.isDraggingOver
                                ? "bg-[#333238] border-[#5a5961]"
                                : draggingDay && day === draggingDay
                                ? "bg-[#252e3d] border-blue-500/30"
                                : "bg-[#28272d] border-[#313036]"
                            }`}
                          >
                            {assignmentsState[cellId]?.map((employee, index) => (
                              <EmployeeCard
                                key={`${employee.id}-${day}`}
                                employee={employee}
                                index={index}
                                draggableId={getDraggableId(employee.id, day)}
                                isOpen={openCardId === getDraggableId(employee.id, day)}
                                onToggle={() => toggleOpenCard(getDraggableId(employee.id, day))}
                                onMarkSick={() => markAvailability(employee.id, day, "sick")}
                                onMarkVacation={() => markAvailability(employee.id, day, "vacation")}
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

            {/* Pool swimlane */}
            <div className="flex flex-col gap-2 mt-6">
              <div className="py-1 text-sm font-semibold text-blue-400">Pool (Available)</div>
              <div className="flex gap-4 items-stretch">
                {DAYS.map((day) => {
                  const poolId = `pool-${day}`;
                  return (
                    <Droppable key={poolId} droppableId={poolId} type={day}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`w-full lg:min-w-max lg:flex-1 min-h-[60px] rounded-md p-2.5 flex-col gap-2.5 border border-dashed transition-opacity duration-150 ${
                            day === activeDay ? "flex" : "hidden"
                          } lg:flex ${
                            draggingDay && day !== draggingDay
                              ? "opacity-30 border-[#252428]"
                              : snapshot.isDraggingOver
                              ? "bg-[#333238] border-[#5a5961]"
                              : draggingDay && day === draggingDay
                              ? "border-blue-500/30"
                              : "border-[#4a4950]"
                          }`}
                        >
                          {assignmentsState[poolId]?.map((employee, index) => (
                            <EmployeeCard
                              key={`${employee.id}-${day}`}
                              employee={employee}
                              index={index}
                              draggableId={getDraggableId(employee.id, day)}
                              isOpen={openCardId === getDraggableId(employee.id, day)}
                              onToggle={() => toggleOpenCard(getDraggableId(employee.id, day))}
                              onMarkSick={() => markAvailability(employee.id, day, "sick")}
                              onMarkVacation={() => markAvailability(employee.id, day, "vacation")}
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

            {/* Sick & Vacation swimlane */}
            <div className="flex flex-col gap-2 mt-4">
              <button
                type="button"
                onClick={() => setSickVacationCollapsed((prev) => !prev)}
                className="flex items-center gap-2 py-1 text-left text-sm font-semibold text-[#a09fa6] transition-colors hover:text-[#ececef]"
              >
                <svg
                  className={`h-3 w-3 transition-transform duration-200 ${sickVacationCollapsed ? "-rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                Sick &amp; Vacation
              </button>

              {!sickVacationCollapsed && (
                <div className="flex gap-4 items-stretch">
                  {DAYS.map((day) => {
                    const entries = Object.entries(availability)
                      .filter(([key]) => key.endsWith(`-${day}`))
                      .map(([key, status]) => {
                        const employeeId = key.slice(0, -(day.length + 1));
                        const employee = dbEmployees.find((e) => e.id === employeeId);
                        return employee ? { employee, status } : null;
                      })
                      .filter(
                        (entry): entry is { employee: Employee; status: AvailabilityStatus } =>
                          entry !== null,
                      );

                    return (
                      <div
                        key={day}
                        className={`w-full lg:min-w-max lg:flex-1 min-h-[60px] rounded-md p-2.5 flex-col gap-2 border border-dashed border-[#3a3940] ${
                          day === activeDay ? "flex" : "hidden"
                        } lg:flex`}
                      >
                        {entries.map(({ employee, status }) => (
                          <button
                            key={employee.id}
                            type="button"
                            onClick={() => clearAvailability(employee.id, day)}
                            title="Click to remove status"
                            className="flex w-full min-w-max cursor-pointer items-center gap-2 rounded-full border border-[#3a3940] bg-[#302f36] p-1.5 text-sm transition-colors hover:border-[#5a5961]"
                          >
                            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-gray-600">
                              {employee.img && (
                                <img
                                  src={employee.img}
                                  alt={employee.name}
                                  className="h-full w-full object-cover"
                                />
                              )}
                            </div>
                            <span className="whitespace-nowrap text-xs font-medium text-[#ececef]">
                              {employee.name}
                            </span>
                            <span className="ml-auto pl-1 text-base">
                              {status === "sick" ? "💉" : "🌴"}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </DragDropContext>
      </main>
    </div>
  );
}
