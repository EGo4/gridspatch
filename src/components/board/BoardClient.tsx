"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import type { DragStart, DropResult } from "@hello-pangea/dnd";

import { EmployeeCard } from "./EmployeeCard";
import { SyringeIcon, PalmTreeIcon } from "~/components/icons";
import { updateAssignment, splitAssignment, mergeAssignment } from "~/server/actions/board";
import { DAYS } from "~/lib/constants";
import {
  getDayNameFromDate,
  getNextWeekParam,
  getPreviousWeekParam,
  getWeekDateMap,
} from "~/lib/week";
import type { Assignment, BoardWeek, DayPart, Employee, Project } from "~/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type AvailabilityStatus = "sick" | "vacation";

type EmployeeEntry = {
  employee: Employee;
  dayPart: DayPart;
};

interface BoardClientProps {
  dbProjects: Project[];
  dbEmployees: Employee[];
  dbAssignments: Assignment[];
  selectedWeek: BoardWeek;
  weeks: BoardWeek[];
}

// ── ID helpers ────────────────────────────────────────────────────────────────

/**
 * Encode a draggable ID.
 * Format: `${employeeId}::${day}::${dayPart}`
 */
const getDraggableId = (employeeId: string, day: string, dayPart: DayPart) =>
  `${employeeId}::${day}::${dayPart}`;

const parseFromDraggableId = (id: string): { employeeId: string; day: string; dayPart: DayPart } => {
  const [employeeId = "", day = "", dayPart = "full_day"] = id.split("::");
  return { employeeId, day, dayPart: dayPart as DayPart };
};

/**
 * Strip the `-pre` / `-post` suffix to get the base droppable ID,
 * then extract the day name from it.
 */
const getDayFromDroppableId = (droppableId: string): string => {
  const stripped = droppableId.replace(/-(pre|post)$/, "");
  if (stripped.startsWith("pool-")) return stripped.replace("pool-", "");
  return DAYS.find((day) => stripped.endsWith(`-${day}`)) ?? "";
};

/** Extract the projectId from a droppable ID (null for pool droppables). */
const getProjectIdFromDroppableId = (droppableId: string): string | null => {
  const stripped = droppableId.replace(/-(pre|post)$/, "");
  if (stripped.startsWith("pool-")) return null;
  const day = DAYS.find((d) => stripped.endsWith(`-${d}`));
  if (!day) return null;
  return stripped.slice(0, -(day.length + 1));
};

/** Determine which DayPart a droppable represents from its suffix. */
const getDayPartFromDroppableId = (droppableId: string): DayPart => {
  if (droppableId.endsWith("-pre")) return "pre_lunch";
  if (droppableId.endsWith("-post")) return "after_lunch";
  return "full_day";
};

// Droppable IDs — project cells
const fullDayDroppableId  = (projectId: string, day: string) => `${projectId}-${day}`;
const preLunchDroppableId = (projectId: string, day: string) => `${projectId}-${day}-pre`;
const afterLunchDroppableId = (projectId: string, day: string) => `${projectId}-${day}-post`;

// Droppable IDs — pool (full-day only, no split section)
const poolFullDayId = (day: string) => `pool-${day}`;

// ── Component ─────────────────────────────────────────────────────────────────

export function BoardClient({
  dbProjects,
  dbEmployees,
  dbAssignments,
  selectedWeek,
  weeks,
}: BoardClientProps) {
  const [assignmentsState, setAssignmentsState] = useState<Record<string, EmployeeEntry[]>>({});
  const [activeDay, setActiveDay] = useState("Monday");
  const [isLoaded, setIsLoaded] = useState(false);
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);
  const [draggingDay, setDraggingDay] = useState<string | null>(null);
  const [draggingDayPart, setDraggingDayPart] = useState<DayPart | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, AvailabilityStatus>>({});
  const [sickVacationCollapsed, setSickVacationCollapsed] = useState(true);

  const weekDates = getWeekDateMap(selectedWeek.startDateIso);

  // ── Initialise state from DB ───────────────────────────────────────────────

  useEffect(() => {
    const state: Record<string, EmployeeEntry[]> = {};

    // Seed all cells with empty arrays.
    dbProjects.forEach((project) =>
      DAYS.forEach((day) => {
        state[fullDayDroppableId(project.id, day)]    = [];
        state[preLunchDroppableId(project.id, day)]   = [];
        state[afterLunchDroppableId(project.id, day)] = [];
      }),
    );
    DAYS.forEach((day) => {
      state[poolFullDayId(day)] = [];
    });

    // Track which employees are split (have any half-day assignment) per day.
    const splitSet = new Set<string>(); // `${employeeId}-${day}`
    const fullDayProjectAssigned = new Set<string>(); // `${employeeId}-${day}`

    dbAssignments.forEach((assignment) => {
      const dayName = getDayNameFromDate(assignment.date, selectedWeek.startDateIso);
      if (!dayName) return;
      const employee = dbEmployees.find((e) => e.id === assignment.employeeId);
      if (!employee) return;

      const key = `${assignment.employeeId}-${dayName}`;

      if (assignment.dayPart === "full_day") {
        if (assignment.projectId) {
          fullDayProjectAssigned.add(key);
          const cellId = fullDayDroppableId(assignment.projectId, dayName);
          state[cellId] = [...(state[cellId] ?? []), { employee, dayPart: "full_day" }];
        }
      } else if (assignment.dayPart === "pre_lunch") {
        splitSet.add(key);
        if (assignment.projectId) {
          const cellId = preLunchDroppableId(assignment.projectId, dayName);
          state[cellId] = [...(state[cellId] ?? []), { employee, dayPart: "pre_lunch" }];
        }
      } else if (assignment.dayPart === "after_lunch") {
        splitSet.add(key);
        if (assignment.projectId) {
          const cellId = afterLunchDroppableId(assignment.projectId, dayName);
          state[cellId] = [...(state[cellId] ?? []), { employee, dayPart: "after_lunch" }];
        }
      }
    });

    // Unassigned full-day employees go to the pool.
    // Split employees are fully represented by their project-cell halves;
    // they don't appear in the pool.
    dbEmployees.forEach((employee) => {
      DAYS.forEach((day) => {
        const key = `${employee.id}-${day}`;
        if (!splitSet.has(key) && !fullDayProjectAssigned.has(key)) {
          state[poolFullDayId(day)] = [
            ...(state[poolFullDayId(day)] ?? []),
            { employee, dayPart: "full_day" },
          ];
        }
      });
    });

    setAssignmentsState(state);
    setIsLoaded(true);
  }, [dbProjects, dbEmployees, dbAssignments, selectedWeek.startDateIso]);

  // ── Card toggle ───────────────────────────────────────────────────────────

  const toggleOpenCard = (cardId: string) =>
    setOpenCardId((prev) => (prev === cardId ? null : cardId));

  // ── Availability (sick / vacation) ───────────────────────────────────────

  const markAvailability = (employeeId: string, day: string, status: AvailabilityStatus) => {
    setAvailability((prev) => ({ ...prev, [`${employeeId}-${day}`]: status }));
    setAssignmentsState((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (getDayFromDroppableId(key) === day) {
          next[key] = (next[key] ?? []).filter((e) => e.employee.id !== employeeId);
        }
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
        [poolFullDayId(day)]: [...(prev[poolFullDayId(day)] ?? []), { employee, dayPart: "full_day" }],
      }));
    }
  };

  // ── Split day ─────────────────────────────────────────────────────────────
  // Only allowed from project cells (pool cards don't have a split button).

  const splitDay = (employeeId: string, day: string, sourceCellId: string) => {
    const employee = dbEmployees.find((e) => e.id === employeeId);
    if (!employee) return;

    const projectId = getProjectIdFromDroppableId(sourceCellId);
    if (!projectId) return;

    const preId  = preLunchDroppableId(projectId, day);
    const postId = afterLunchDroppableId(projectId, day);

    setAssignmentsState((prev) => {
      const next = { ...prev };
      next[sourceCellId] = (next[sourceCellId] ?? []).filter(
        (e) => !(e.employee.id === employeeId && e.dayPart === "full_day"),
      );
      next[preId]  = [...(next[preId]  ?? []), { employee, dayPart: "pre_lunch" }];
      next[postId] = [...(next[postId] ?? []), { employee, dayPart: "after_lunch" }];
      return next;
    });

    setOpenCardId(null);

    const dateIso = weekDates[day as keyof typeof weekDates];
    if (dateIso) {
      void splitAssignment(employeeId, projectId, dateIso, selectedWeek.id);
    }
  };

  // ── Merge day ─────────────────────────────────────────────────────────────

  const mergeDay = (employeeId: string, day: string, sourceCellId: string) => {
    const employee = dbEmployees.find((e) => e.id === employeeId);
    if (!employee) return;

    const projectId = getProjectIdFromDroppableId(sourceCellId);
    const fdId = projectId
      ? fullDayDroppableId(projectId, day)
      : poolFullDayId(day);

    setAssignmentsState((prev) => {
      const next = { ...prev };
      // Remove all halves for this employee across the whole day.
      for (const key of Object.keys(next)) {
        if (getDayFromDroppableId(key) === day) {
          next[key] = (next[key] ?? []).filter((e) => e.employee.id !== employeeId);
        }
      }
      // Re-add as full_day in the project cell (or pool).
      next[fdId] = [...(next[fdId] ?? []), { employee, dayPart: "full_day" }];
      return next;
    });

    setOpenCardId(null);

    const dateIso = weekDates[day as keyof typeof weekDates];
    if (dateIso) {
      void mergeAssignment(employeeId, projectId, dateIso, selectedWeek.id);
    }
  };

  // ── Drag and drop ─────────────────────────────────────────────────────────

  const onDragStart = (start: DragStart) => {
    setDraggingDay(getDayFromDroppableId(start.source.droppableId) || null);
    setDraggingDayPart(parseFromDraggableId(start.draggableId).dayPart);
    setOpenCardId(null);
  };

  const onDragEnd = async (result: DropResult) => {
    setDraggingDay(null);
    setDraggingDayPart(null);
    const { source, destination, draggableId } = result;
    if (!destination) return;

    const sourceDay = getDayFromDroppableId(source.droppableId);
    const destinationDay = getDayFromDroppableId(destination.droppableId);
    if (!sourceDay || !destinationDay || sourceDay !== destinationDay) return;

    const sourceList = [...(assignmentsState[source.droppableId] ?? [])];
    const [removed] = sourceList.splice(source.index, 1);
    if (!removed) return;

    if (source.droppableId === destination.droppableId) {
      sourceList.splice(destination.index, 0, removed);
      setAssignmentsState({ ...assignmentsState, [source.droppableId]: sourceList });
      return;
    }

    const destList = [...(assignmentsState[destination.droppableId] ?? [])];

    // When a half-day card moves between AM/PM columns, update its dayPart.
    const destDayPart = getDayPartFromDroppableId(destination.droppableId);
    const updatedEntry: EmployeeEntry = { ...removed, dayPart: destDayPart };

    destList.splice(destination.index, 0, updatedEntry);
    setAssignmentsState({
      ...assignmentsState,
      [source.droppableId]: sourceList,
      [destination.droppableId]: destList,
    });

    const { employeeId, dayPart: sourceDayPart } = parseFromDraggableId(draggableId);
    const targetProjectId = getProjectIdFromDroppableId(destination.droppableId);
    const targetDateIso = weekDates[destinationDay as keyof typeof weekDates];

    if (targetDateIso) {
      // If the card switched AM↔PM columns, delete the old assignment first.
      if (sourceDayPart !== destDayPart && sourceDayPart !== "full_day") {
        await updateAssignment(employeeId, null, targetDateIso, selectedWeek.id, sourceDayPart);
      }
      await updateAssignment(employeeId, targetProjectId, targetDateIso, selectedWeek.id, destDayPart);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isLoaded) return <div className="p-10 text-white">Loading board...</div>;

  /**
   * Render a project day cell.
   * Full-day cards sit above the horizontal divider.
   * Below it: AM cards on the left and PM cards on the right, separated by a
   * vertical line. The divider and half-day section are only shown when at
   * least one half-day card exists (or the user is dragging a half-day card
   * onto this day column so the drop zones need to be visible).
   */
  const renderCell = (projectId: string, day: string) => {
    const fdId   = fullDayDroppableId(projectId, day);
    const preId  = preLunchDroppableId(projectId, day);
    const postId = afterLunchDroppableId(projectId, day);

    const isDimmed = Boolean(draggingDay && day !== draggingDay);
    const isDraggingFullHere = draggingDay === day && draggingDayPart === "full_day";
    const isDraggingAmHere   = draggingDay === day && draggingDayPart === "pre_lunch";
    const isDraggingPmHere   = draggingDay === day && draggingDayPart === "after_lunch";
    const isDraggingHalfHere = isDraggingAmHere || isDraggingPmHere;

    const hasAm = (assignmentsState[preId]  ?? []).length > 0;
    const hasPm = (assignmentsState[postId] ?? []).length > 0;
    const hasHalves = hasAm || hasPm;

    // Show the half-section (horizontal divider + AM/PM area) whenever halves
    // exist or a half-day card of this day is being dragged.
    const showHalfSection = hasHalves || isDraggingHalfHere;

    return (
      <div
        key={day}
        className={`day-cell w-full lg:min-w-max lg:flex-1 flex flex-col rounded-md border transition-opacity duration-150 overflow-hidden ${
          day === activeDay ? "" : "hidden"
        } lg:flex lg:flex-col ${
          isDimmed ? "opacity-30 border-[#252428] bg-[#28272d]" : "border-[#313036] bg-[#28272d]"
        }`}
      >
        {/* Full-day section */}
        <Droppable droppableId={fdId} type={day}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`flex-1 min-h-[56px] p-2.5 flex flex-col gap-2.5 transition-colors ${
                snapshot.isDraggingOver
                  ? "bg-[#333238]"
                  : isDraggingFullHere
                    ? "bg-[#252e3d]"
                    : ""
              }`}
            >
              {(assignmentsState[fdId] ?? []).map((entry, index) => (
                <EmployeeCard
                  key={`${entry.employee.id}-${day}-full`}
                  employee={entry.employee}
                  index={index}
                  draggableId={getDraggableId(entry.employee.id, day, "full_day")}
                  dayPart="full_day"
                  isOpen={openCardId === getDraggableId(entry.employee.id, day, "full_day")}
                  onToggle={() => toggleOpenCard(getDraggableId(entry.employee.id, day, "full_day"))}
                  onMarkSick={() => markAvailability(entry.employee.id, day, "sick")}
                  onMarkVacation={() => markAvailability(entry.employee.id, day, "vacation")}
                  onSplitDay={() => splitDay(entry.employee.id, day, fdId)}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        {/* Horizontal divider — only when this cell has split employees */}
        {showHalfSection && <div className="half-day-divider mx-2.5" />}

        {/* AM / PM columns — always mounted for DnD at real height so @hello-pangea/dnd
             can detect them even before any split exists in this cell.
             Invisible (opacity-0) when there is nothing to show; visible on drag-over.
             isDropDisabled prevents AM cards landing in PM and vice versa. */}
        <div className="half-day-cols overflow-hidden flex-none">
          {/* AM column — rejects PM card drops */}
          <Droppable
            droppableId={preId}
            type={`${day}-half`}
            isDropDisabled={draggingDayPart === "after_lunch"}
          >
            {(provided, snapshot) => {
              return (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`half-day-col flex flex-col gap-2 transition-all ${
                    showHalfSection ? "p-2 pb-2.5 half-col-visible" : "half-col-collapsed"
                  } ${showHalfSection ? "" : "opacity-0"} ${
                    snapshot.isDraggingOver
                      ? "bg-[var(--am-zone-active)]"
                      : showHalfSection
                        ? "bg-[var(--am-zone)]"
                        : ""
                  }`}
                >
                  {showHalfSection && (
                    <div className="text-[9px] font-semibold text-[#6b6875] uppercase tracking-wider">AM</div>
                  )}
                  {(assignmentsState[preId] ?? []).map((entry, index) => (
                    <EmployeeCard
                      key={`${entry.employee.id}-${day}-pre`}
                      employee={entry.employee}
                      index={index}
                      draggableId={getDraggableId(entry.employee.id, day, "pre_lunch")}
                      dayPart="pre_lunch"
                      isOpen={openCardId === getDraggableId(entry.employee.id, day, "pre_lunch")}
                      onToggle={() => toggleOpenCard(getDraggableId(entry.employee.id, day, "pre_lunch"))}
                      onMarkSick={() => markAvailability(entry.employee.id, day, "sick")}
                      onMarkVacation={() => markAvailability(entry.employee.id, day, "vacation")}
                      onMergeDay={() => mergeDay(entry.employee.id, day, preId)}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              );
            }}
          </Droppable>

          {/* Divider — shown whenever the split section is visible */}
          {showHalfSection && <div className="half-day-col-divider" />}

          {/* PM column — rejects AM card drops */}
          <Droppable
            droppableId={postId}
            type={`${day}-half`}
            isDropDisabled={draggingDayPart === "pre_lunch"}
          >
            {(provided, snapshot) => {
              return (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`half-day-col flex flex-col gap-2 transition-all ${
                    showHalfSection ? "p-2 pb-2.5 half-col-visible" : "half-col-collapsed"
                  } ${showHalfSection ? "" : "opacity-0"} ${
                    snapshot.isDraggingOver
                      ? "bg-[var(--pm-zone-active)]"
                      : showHalfSection
                        ? "bg-[var(--pm-zone)]"
                        : ""
                  }`}
                >
                  {showHalfSection && (
                    <div className="text-[9px] font-semibold text-[#6b6875] uppercase tracking-wider">PM</div>
                  )}
                  {(assignmentsState[postId] ?? []).map((entry, index) => (
                    <EmployeeCard
                      key={`${entry.employee.id}-${day}-post`}
                      employee={entry.employee}
                      index={index}
                      draggableId={getDraggableId(entry.employee.id, day, "after_lunch")}
                      dayPart="after_lunch"
                      isOpen={openCardId === getDraggableId(entry.employee.id, day, "after_lunch")}
                      onToggle={() => toggleOpenCard(getDraggableId(entry.employee.id, day, "after_lunch"))}
                      onMarkSick={() => markAvailability(entry.employee.id, day, "sick")}
                      onMarkVacation={() => markAvailability(entry.employee.id, day, "vacation")}
                      onMergeDay={() => mergeDay(entry.employee.id, day, postId)}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              );
            }}
          </Droppable>
        </div>
      </div>
    );
  };

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
                  {DAYS.map((day) => renderCell(project.id, day))}
                </div>
              </div>
            ))}

            {/* Pool swimlane — full-day only, no split section */}
            <div className="flex flex-col gap-2 mt-6">
              <div className="py-1 text-sm font-semibold text-blue-400">Pool (Available)</div>
              <div className="flex gap-4 items-stretch">
                {DAYS.map((day) => {
                  const fdId = poolFullDayId(day);
                  const isDimmed = Boolean(draggingDay && day !== draggingDay);
                  const isDraggingFullHere = draggingDay === day && draggingDayPart === "full_day";

                  return (
                    <div
                      key={day}
                      className={`w-full lg:min-w-max lg:flex-1 flex flex-col rounded-md border border-dashed transition-opacity duration-150 ${
                        day === activeDay ? "" : "hidden"
                      } lg:block ${
                        isDimmed ? "opacity-30 border-[#252428]" : "border-[#4a4950]"
                      }`}
                    >
                      <Droppable droppableId={fdId} type={day}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex-1 min-h-[56px] p-2.5 flex flex-col gap-2.5 transition-colors ${
                              snapshot.isDraggingOver
                                ? "bg-[#333238]"
                                : isDraggingFullHere
                                  ? "bg-[#252e3d]"
                                  : ""
                            }`}
                          >
                            {(assignmentsState[fdId] ?? []).map((entry, index) => (
                              <EmployeeCard
                                key={`${entry.employee.id}-${day}-pool`}
                                employee={entry.employee}
                                index={index}
                                draggableId={getDraggableId(entry.employee.id, day, "full_day")}
                                dayPart="full_day"
                                isOpen={openCardId === getDraggableId(entry.employee.id, day, "full_day")}
                                onToggle={() => toggleOpenCard(getDraggableId(entry.employee.id, day, "full_day"))}
                                onMarkSick={() => markAvailability(entry.employee.id, day, "sick")}
                                onMarkVacation={() => markAvailability(entry.employee.id, day, "vacation")}
                              />
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
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
                            <span className="ml-auto pl-1 text-[#c8c4be]">
                              {status === "sick" ? <SyringeIcon size={16} /> : <PalmTreeIcon size={16} />}
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
