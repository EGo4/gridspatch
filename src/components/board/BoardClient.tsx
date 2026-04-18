"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import type { DragStart, DropResult } from "@hello-pangea/dnd";

import { EmployeeCard } from "./EmployeeCard";
import { SyringeIcon, PalmTreeIcon, CopyIcon, AssignSiteIcon, FilterIcon } from "~/components/icons";
import { authClient } from "~/server/better-auth/client";
import { updateAssignment, splitAssignment, mergeAssignment, copyDayAssignments, copyWeekAssignments, setAvailability as persistAvailability, clearAvailability as unpersistAvailability } from "~/server/actions/board";
import { DAYS } from "~/lib/constants";
import {
  getDayNameFromDate,
  getNextWeekParam,
  getPreviousWeekParam,
  getWeekDateMap,
} from "~/lib/week";
import type { Assignment, Availability, BoardWeek, DayPart, Employee, Project } from "~/types";

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
  dbAvailability: Availability[];
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

// ── Constants ─────────────────────────────────────────────────────────────────

const COLLAPSED_LS_KEY  = "gridspatch:collapsed-rows";
const FILTER_MANAGER_KEY = "gridspatch:filter-manager";

// ── Component ─────────────────────────────────────────────────────────────────

export function BoardClient({
  dbProjects,
  dbEmployees,
  dbAssignments,
  dbAvailability,
  selectedWeek,
  weeks,
}: BoardClientProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
  }
  const [assignmentsState, setAssignmentsState] = useState<Record<string, EmployeeEntry[]>>({});
  const [activeDay, setActiveDay] = useState("Monday");
  const [isLoaded, setIsLoaded] = useState(false);
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);
  const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
  const [draggingDay, setDraggingDay] = useState<string | null>(null);
  const [draggingDayPart, setDraggingDayPart] = useState<DayPart | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, AvailabilityStatus>>({});
  const [collapsedRows, setCollapsedRows] = useState<Set<string> | null>(null);
  const [copyPopoverDay, setCopyPopoverDay] = useState<string | null>(null);
  const [sitePickerFor, setSitePickerFor] = useState<{
    employeeId: string;
    day: string;
    left: number;
    top: number;
  } | null>(null);
  const [filterManagerId, setFilterManagerId] = useState<string | null>(null);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [pendingManagerId, setPendingManagerId] = useState<string | null>(null);
  const [copyWeekModalOpen, setCopyWeekModalOpen] = useState(false);

  const weekDates = getWeekDateMap(selectedWeek.startDateIso);

  // ── Close day dropdown on outside click or Escape ────────────────────────
  useEffect(() => {
    if (!dayDropdownOpen) return;
    const handleClick = () => setDayDropdownOpen(false);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDayDropdownOpen(false); };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [dayDropdownOpen]);

  // ── Close copy popover on outside click or Escape ─────────────────────────
  useEffect(() => {
    if (!copyPopoverDay) return;
    const handleClick = () => setCopyPopoverDay(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCopyPopoverDay(null); };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [copyPopoverDay]);

  // ── Persist collapsed rows to localStorage ────────────────────────────────
  useEffect(() => {
    if (collapsedRows === null) return;
    localStorage.setItem(COLLAPSED_LS_KEY, JSON.stringify([...collapsedRows]));
  }, [collapsedRows]);

  // ── Collapse toggle ───────────────────────────────────────────────────────
  const toggleCollapsed = (id: string) => {
    setCollapsedRows((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Close site picker on outside click or Escape ──────────────────────────
  useEffect(() => {
    if (!sitePickerFor) return;
    const handleClick = () => setSitePickerFor(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSitePickerFor(null); };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [sitePickerFor]);

  // ── Hydrate filter from localStorage ─────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(FILTER_MANAGER_KEY);
    if (stored) setFilterManagerId(stored);
  }, []);

  // ── Persist filter to localStorage ───────────────────────────────────────
  useEffect(() => {
    if (filterManagerId) {
      localStorage.setItem(FILTER_MANAGER_KEY, filterManagerId);
    } else {
      localStorage.removeItem(FILTER_MANAGER_KEY);
    }
  }, [filterManagerId]);

  // ── Close fly-out side menu on outside click or Escape ───────────────────
  useEffect(() => {
    if (!sideMenuOpen) return;
    const handleClick = () => setSideMenuOpen(false);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSideMenuOpen(false); };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [sideMenuOpen]);

  // ── Filter modal: sync pending selection and handle Escape ──────────────────
  useEffect(() => {
    if (!filterModalOpen) return;
    setPendingManagerId(filterManagerId);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFilterModalOpen(false); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [filterModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Managers that have at least one project ───────────────────────────────
  const managersWithSites = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of dbProjects) {
      if (p.constructionManagerId && p.constructionManagerName && !seen.has(p.constructionManagerId)) {
        seen.set(p.constructionManagerId, p.constructionManagerName);
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [dbProjects]);

  // ── Previous week (for copy-week feature) ────────────────────────────────
  const previousWeek = React.useMemo(() => {
    const selectedStart = new Date(selectedWeek.startDateIso).getTime();
    return weeks.find((w) => new Date(w.startDateIso).getTime() < selectedStart) ?? null;
  }, [weeks, selectedWeek.startDateIso]);

  const targetWeekHasAssignments = dbAssignments.some((a) => a.projectId !== null);

  // ── Active filter label ───────────────────────────────────────────────────
  const activeManagerName = filterManagerId
    ? (managersWithSites.find((m) => m.id === filterManagerId)?.name ?? null)
    : null;

  // ── Filtered projects ─────────────────────────────────────────────────────
  const visibleProjects = filterManagerId
    ? dbProjects.filter((p) => p.constructionManagerId === filterManagerId)
    : dbProjects;

  // ── Assign pool worker to a project site ──────────────────────────────────
  const assignToSite = (employeeId: string, day: string, projectId: string) => {
    const employee = dbEmployees.find((e) => e.id === employeeId);
    if (!employee) return;

    const poolId   = poolFullDayId(day);
    const targetId = fullDayDroppableId(projectId, day);

    setAssignmentsState((prev) => {
      const next = { ...prev };
      next[poolId]   = (next[poolId]   ?? []).filter((e) => e.employee.id !== employeeId);
      next[targetId] = [...(next[targetId] ?? []), { employee, dayPart: "full_day" }];
      return next;
    });

    setSitePickerFor(null);
    setOpenCardId(null);

    const dateIso = weekDates[day as keyof typeof weekDates];
    if (dateIso) {
      void updateAssignment(employeeId, projectId, dateIso, selectedWeek.id, "full_day");
    }
  };

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

    // Build availability map first so unavailable employees are excluded from cells below.
    const initialAvailability: Record<string, AvailabilityStatus> = {};
    const unavailableSet = new Set<string>(); // `${employeeId}-${day}`
    dbAvailability.forEach((a) => {
      const dayName = getDayNameFromDate(a.date, selectedWeek.startDateIso);
      if (!dayName) return;
      const key = `${a.employeeId}-${dayName}`;
      initialAvailability[key] = a.status as AvailabilityStatus;
      unavailableSet.add(key);
    });
    setAvailability(initialAvailability);

    // Track which employees are split (have any half-day assignment) per day.
    const splitSet = new Set<string>(); // `${employeeId}-${day}`
    const fullDayProjectAssigned = new Set<string>(); // `${employeeId}-${day}`

    dbAssignments.forEach((assignment) => {
      const dayName = getDayNameFromDate(assignment.date, selectedWeek.startDateIso);
      if (!dayName) return;
      const employee = dbEmployees.find((e) => e.id === assignment.employeeId);
      if (!employee) return;

      const key = `${assignment.employeeId}-${dayName}`;
      // Skip assignments for days where the employee is sick/on vacation.
      if (unavailableSet.has(key)) return;

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
    // they don't appear in the pool. Sick/vacation employees are excluded too.
    dbEmployees.forEach((employee) => {
      DAYS.forEach((day) => {
        const key = `${employee.id}-${day}`;
        if (!splitSet.has(key) && !fullDayProjectAssigned.has(key) && !unavailableSet.has(key)) {
          state[poolFullDayId(day)] = [
            ...(state[poolFullDayId(day)] ?? []),
            { employee, dayPart: "full_day" },
          ];
        }
      });
    });

    setAssignmentsState(state);
    setIsLoaded(true);

    // Initialise collapsed rows from localStorage once; don't reset on week navigation.
    setCollapsedRows((prev) => {
      if (prev !== null) return prev;
      const stored = localStorage.getItem(COLLAPSED_LS_KEY);
      if (stored) {
        try { return new Set(JSON.parse(stored) as string[]); } catch { /* ignore */ }
      }
      // Default: sick-vacation section + all on-hold projects start collapsed.
      const defaults = new Set(["sick-vacation"]);
      dbProjects.forEach((p) => { if (p.status === "on_hold") defaults.add(p.id); });
      return defaults;
    });
  }, [dbProjects, dbEmployees, dbAssignments, dbAvailability, selectedWeek.startDateIso]);

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
    const dateIso = weekDates[day as keyof typeof weekDates];
    if (dateIso) {
      void persistAvailability(employeeId, dateIso, selectedWeek.id, status);
    }
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
    const dateIso = weekDates[day as keyof typeof weekDates];
    if (dateIso) {
      void unpersistAvailability(employeeId, dateIso);
    }
  };

  // ── Copy day ──────────────────────────────────────────────────────────────

  const copyDay = (sourceDay: string, targetDay: string) => {
    setAssignmentsState((prev) => {
      const next = { ...prev };

      // Clear all project cells for the target day.
      dbProjects.forEach((project) => {
        next[fullDayDroppableId(project.id, targetDay)]    = [];
        next[preLunchDroppableId(project.id, targetDay)]   = [];
        next[afterLunchDroppableId(project.id, targetDay)] = [];
      });

      // Copy each project cell from source to target.
      dbProjects.forEach((project) => {
        next[fullDayDroppableId(project.id, targetDay)]    = [...(prev[fullDayDroppableId(project.id, sourceDay)]    ?? [])];
        next[preLunchDroppableId(project.id, targetDay)]   = [...(prev[preLunchDroppableId(project.id, sourceDay)]   ?? [])];
        next[afterLunchDroppableId(project.id, targetDay)] = [...(prev[afterLunchDroppableId(project.id, sourceDay)] ?? [])];
      });

      // Rebuild the pool for the target day: anyone not in a project cell and
      // not marked sick/vacation goes back to the pool.
      const assignedInTarget = new Set<string>();
      dbProjects.forEach((project) => {
        [
          fullDayDroppableId(project.id, targetDay),
          preLunchDroppableId(project.id, targetDay),
          afterLunchDroppableId(project.id, targetDay),
        ].forEach((cellId) => {
          (next[cellId] ?? []).forEach((e) => assignedInTarget.add(e.employee.id));
        });
      });

      const unavailableInTarget = new Set(
        Object.keys(availability)
          .filter((key) => key.endsWith(`-${targetDay}`))
          .map((key) => key.slice(0, -(targetDay.length + 1))),
      );

      next[poolFullDayId(targetDay)] = dbEmployees
        .filter((e) => !assignedInTarget.has(e.id) && !unavailableInTarget.has(e.id))
        .map((e) => ({ employee: e, dayPart: "full_day" as DayPart }));

      return next;
    });

    setCopyPopoverDay(null);

    const sourceDateIso = weekDates[sourceDay as keyof typeof weekDates];
    const targetDateIso = weekDates[targetDay as keyof typeof weekDates];
    if (sourceDateIso && targetDateIso) {
      void copyDayAssignments(sourceDateIso, targetDateIso, selectedWeek.id);
    }
  };

  // ── Copy previous week ───────────────────────────────────────────────────

  const copyPreviousWeek = async () => {
    if (!previousWeek) return;
    setCopyWeekModalOpen(false);
    setSideMenuOpen(false);
    await copyWeekAssignments(
      previousWeek.id,
      selectedWeek.id,
      previousWeek.startDateIso,
      selectedWeek.startDateIso,
    );
    router.refresh();
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
    setCopyPopoverDay(null);
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
  <DragDropContext onDragEnd={onDragEnd} onDragStart={onDragStart}>
    <div className="h-dvh bg-[#1f1e24] font-sans text-[#ececef] flex flex-col lg:flex-row">
      <div className="flex-1 flex flex-col min-h-0">

        {/* Mobile header — outside scroll area so content never scrolls behind it */}
        <div className="lg:hidden flex items-center justify-between bg-[#1f1e24] px-4 pt-4 pb-2 shadow-[0_6px_0_6px_#1f1e24]">

          {/* Day selector pill */}
          <div className="relative inline-flex items-center rounded-full bg-[#28272d] text-sm font-medium text-[#a09fa6]">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setDayDropdownOpen((o) => !o); }}
              className="flex items-center gap-1.5 px-4 py-2 text-[#ececef] transition hover:text-white"
            >
              {activeDay}
              <svg className="h-3 w-3 text-[#8b8893]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dayDropdownOpen && (
              <div className="absolute top-full left-0 z-50 mt-2 min-w-[160px] overflow-hidden rounded-xl border border-[#313036] bg-[#28272d] shadow-xl">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => { setActiveDay(day); setDayDropdownOpen(false); }}
                    className={`block w-full text-left px-4 py-2.5 text-sm font-medium transition ${
                      day === activeDay
                        ? "bg-accent text-white"
                        : "text-[#a09fa6] hover:bg-[#333238] hover:text-[#ececef]"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Week selector pill */}
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
              onClick={(e) => { e.stopPropagation(); setWeekDropdownOpen((o) => !o); }}
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
              <div className="absolute top-full right-0 z-50 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-[#313036] bg-[#28272d] shadow-xl">
                {weeks.map((week) => (
                  <Link
                    key={week.id}
                    href={`/board?week=${week.param}`}
                    onClick={() => setWeekDropdownOpen(false)}
                    className={`block px-4 py-2.5 text-sm font-medium transition ${
                      week.id === selectedWeek.id
                        ? "bg-accent text-white"
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

        <main className="flex-1 overflow-auto min-h-0 px-4 flex flex-col">

        {/* Week selector — desktop only */}
        <div className="mt-4 mb-6 hidden lg:flex items-center justify-center bg-[#1f1e24] relative">
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
                        ? "bg-accent text-white"
                        : "text-[#a09fa6] hover:bg-[#333238] hover:text-[#ececef]"
                    }`}
                  >
                    {week.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Filter + admin links + logout — top-right corner of the desktop header row */}
          <div className="absolute right-0 flex items-center gap-1">


            {isAdmin && (
              <Link
                href="/admin/users"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#6b6875] transition-colors hover:bg-[#28272d] hover:text-[#a09fa6]"
                title="Manage users"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                Users
              </Link>
            )}
            <Link
              href="/admin/employees"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#6b6875] transition-colors hover:bg-[#28272d] hover:text-[#a09fa6]"
              title="Manage employees"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Employees
            </Link>
            <Link
              href="/admin/sites"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#6b6875] transition-colors hover:bg-[#28272d] hover:text-[#a09fa6]"
              title="Manage building sites"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Sites
            </Link>
            <div className="mx-1 h-4 w-px bg-[#3a3940]" />
            <Link
              href="/profile"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#6b6875] transition-colors hover:bg-[#28272d] hover:text-[#a09fa6]"
              title="Account settings"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              Account
            </Link>
            <div className="mx-1 h-4 w-px bg-[#3a3940]" />
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#6b6875] transition-colors hover:bg-[#28272d] hover:text-[#a09fa6]"
              title="Sign out"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </div>
        </div>

          <div className="w-full lg:min-w-max flex flex-col gap-4">

            {/* Day headers — sticky so column labels stay visible while scrolling */}
            <div className="sticky top-0 z-20 hidden lg:flex gap-4 bg-[#1f1e24] -mt-4 pt-4 pb-2 shadow-[0_6px_0_6px_#1f1e24]">
              {DAYS.map((day) => (
                <div
                  key={day}
                  onClick={(e) => e.stopPropagation()}
                  className={`relative w-full lg:min-w-max lg:flex-1 rounded-md p-2.5 font-semibold text-sm transition-opacity duration-150 ${
                    day === activeDay ? "flex" : "hidden"
                  } lg:flex items-center justify-between ${
                    draggingDay && day === draggingDay
                      ? "bg-[#2d3748] text-accent/80 ring-1 ring-inset ring-accent/40"
                      : draggingDay
                      ? "bg-[#28272d] opacity-30"
                      : "bg-[#28272d]"
                  }`}
                >
                  <span>{day}</span>
                  {!draggingDay && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCopyPopoverDay(copyPopoverDay === day ? null : day);
                      }}
                      title={`Copy assignments to ${day}`}
                      className="flex items-center rounded bg-[#3a3940] p-1.5 text-[#c8c4be] transition-colors hover:bg-[#4a4950] hover:text-white"
                    >
                      <CopyIcon size={14} />
                    </button>
                  )}
                  {copyPopoverDay === day && (
                    <div className="absolute top-full left-0 z-50 mt-1 min-w-[140px] rounded-lg border border-[#313036] bg-[#1f1e24] p-2 shadow-xl">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6b6875]">
                        Copy from
                      </div>
                      {DAYS.filter((d) => d !== day).map((sourceDay) => (
                        <button
                          key={sourceDay}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyDay(sourceDay, day);
                          }}
                          className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-[#a09fa6] transition-colors hover:bg-[#333238] hover:text-[#ececef]"
                        >
                          {sourceDay}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Project swimlanes */}
            {visibleProjects
              .filter((p) => p.status !== "not_active")
              .map((project) => {
                const isCollapsed = (collapsedRows ?? new Set()).has(project.id);
                const isOnHold = project.status === "on_hold";
                return (
                  <div key={project.id} className={`flex flex-col gap-2 ${isOnHold ? "opacity-50" : ""}`}>
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(project.id)}
                      className="flex items-center gap-2 py-1 text-left text-sm font-semibold text-[#ececef] transition-colors hover:text-white"
                    >
                      <svg
                        className={`h-3 w-3 flex-shrink-0 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                      {project.name}
                      {isOnHold && (
                        <span className="ml-1 rounded-full bg-[#2c2619] px-2 py-0.5 text-[10px] font-semibold text-[#fbbf24]">
                          On hold
                        </span>
                      )}
                      {project.constructionManagerName && (
                        <span className="ml-1 flex items-center gap-1 text-[11px] font-normal text-[#6b6875]">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="8" r="4" />
                            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                          </svg>
                          {project.constructionManagerName}
                        </span>
                      )}
                    </button>
                    {!isCollapsed && (
                      <div className="flex gap-4 items-stretch">
                        {DAYS.map((day) => renderCell(project.id, day))}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* Sick & Vacation swimlane */}
            <div className="flex flex-col gap-2 mt-4 pb-4">
              <button
                type="button"
                onClick={() => toggleCollapsed("sick-vacation")}
                className="flex items-center gap-2 py-1 text-left text-sm font-semibold text-[#a09fa6] transition-colors hover:text-[#ececef]"
              >
                <svg
                  className={`h-3 w-3 transition-transform duration-200 ${(collapsedRows ?? new Set()).has("sick-vacation") ? "-rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                Sick &amp; Vacation
              </button>

              {!(collapsedRows ?? new Set()).has("sick-vacation") && (
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
        </main>

        {/* Pool wrapper — fly-out side menu lives here, always above the pool */}
        <div className="relative">

          {/* Fly-out side menu */}
          <div
            className="absolute bottom-full right-0 flex items-end pr-4 pb-2 z-30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex items-center gap-1" onClick={(e) => e.stopPropagation()}>

              {/* Expanded panel — flies out to the left */}
              {sideMenuOpen && (
                <div className="flex items-center gap-1 mr-1">
                  {/* Copy previous week button — desktop only */}
                  {previousWeek && (
                    <button
                      type="button"
                      onClick={() => { setSideMenuOpen(false); setCopyWeekModalOpen(true); }}
                      className="hidden lg:flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium bg-[#28272d] text-[#a09fa6] transition-colors hover:bg-[#313036] hover:text-[#ececef]"
                      title={`Copy assignments from ${previousWeek.label}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy prev. week
                    </button>
                  )}

                  {/* Filter button */}
                  <button
                    type="button"
                    onClick={() => { setSideMenuOpen(false); setFilterModalOpen(true); }}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      filterManagerId
                        ? "bg-accent text-white"
                        : "bg-[#28272d] text-[#a09fa6] hover:bg-[#313036] hover:text-[#ececef]"
                    }`}
                  >
                    <FilterIcon size={12} />
                    {activeManagerName ?? "Filter"}
                  </button>

                  {/* Reset — only when a filter is active */}
                  {filterManagerId && (
                    <button
                      type="button"
                      onClick={() => setFilterManagerId(null)}
                      title="Clear filter"
                      className="flex items-center rounded-lg p-2 bg-[#28272d] text-[#a09fa6] transition-colors hover:bg-[#313036] hover:text-[#ececef]"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* Toggle handle */}
              <button
                type="button"
                onClick={() => setSideMenuOpen((o) => !o)}
                title={sideMenuOpen ? "Close menu" : "Open menu"}
                className={`flex items-center justify-center rounded-lg w-8 h-9 transition-colors ${
                  filterManagerId
                    ? "bg-accent text-white shadow-lg"
                    : "bg-[#313036] text-[#6b6875] hover:bg-[#3a3940] hover:text-[#a09fa6]"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d={sideMenuOpen ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
                </svg>
              </button>

            </div>
          </div>

          {/* Pool — always visible at the bottom of the content column, scrolls independently */}
          <div className="pool-overlay flex flex-col gap-2 bg-[#1f1e24] border-t border-[#313036] px-4 pt-3 pb-4">
          <button
            type="button"
            onClick={() => toggleCollapsed("pool")}
            className="flex items-center gap-2 py-1 text-left text-sm font-semibold text-accent transition-colors hover:text-accent/80"
          >
            <svg
              className={`h-3 w-3 flex-shrink-0 transition-transform duration-200 ${(collapsedRows ?? new Set()).has("pool") ? "-rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            Pool (Available)
          </button>
          {!(collapsedRows ?? new Set()).has("pool") && <div className="flex gap-4 items-stretch">
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
                            onAssignToSite={(anchor) => {
                              setOpenCardId(null);
                              setSitePickerFor({ employeeId: entry.employee.id, day, ...anchor });
                            }}
                          />
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>}
        </div>{/* end pool */}
        </div>{/* end pool wrapper */}

      </div>
    </div>

    {/* Site picker — fixed overlay, pops up above the "assign to site" button */}
    {sitePickerFor && (
      <div
        onClick={(e) => e.stopPropagation()}
        className="site-picker z-[100] min-w-[180px] overflow-hidden rounded-xl border border-[#313036] bg-[#1f1e24] py-1 shadow-2xl"
        style={{
          "--picker-left": `${Math.min(sitePickerFor.left, window.innerWidth - 196)}px`,
          "--picker-bottom": `${window.innerHeight - sitePickerFor.top + 8}px`,
        } as React.CSSProperties}
      >
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#6b6875]">
          Assign to site
        </div>
        {dbProjects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              assignToSite(sitePickerFor.employeeId, sitePickerFor.day, project.id);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[#a09fa6] transition-colors hover:bg-[#333238] hover:text-[#ececef]"
          >
            <AssignSiteIcon size={12} className="flex-shrink-0 text-[#6b6875]" />
            {project.name}
          </button>
        ))}
      </div>
    )}


    {/* Copy previous week confirmation modal */}
    {copyWeekModalOpen && previousWeek && (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setCopyWeekModalOpen(false)}
        />
        <div
          className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[#313036] bg-[#1f1e24] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#313036] px-5 py-4">
            <h3 className="text-sm font-semibold text-[#ececef]">Copy previous week</h3>
            <button
              type="button"
              onClick={() => setCopyWeekModalOpen(false)}
              title="Close"
              className="flex items-center rounded p-1 text-[#6b6875] transition-colors hover:text-[#ececef]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className="text-sm text-[#a09fa6]">
              Copy all assignments from{" "}
              <span className="font-semibold text-[#ececef]">{previousWeek.label}</span>{" "}
              into{" "}
              <span className="font-semibold text-[#ececef]">{selectedWeek.label}</span>?
            </p>

            {targetWeekHasAssignments && (
              <div className="flex items-start gap-2 rounded-lg border border-[#4a3b1a] bg-[#2c2619] px-3 py-2.5 text-xs text-[#fbbf24]">
                <svg className="mt-0.5 flex-shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                This week already has assignments. They will be overwritten.
              </div>
            )}

            <p className="text-xs text-[#6b6875]">
              Sick and vacation days are not copied — affected employees will appear in the pool.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[#313036] px-5 py-4">
            <button
              type="button"
              onClick={() => setCopyWeekModalOpen(false)}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-[#a09fa6] transition-colors hover:text-[#ececef]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void copyPreviousWeek()}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
            >
              Copy
            </button>
          </div>
        </div>
      </>
    )}

    {/* Filter modal */}
    {filterModalOpen && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setFilterModalOpen(false)}
        />

        {/* Dialog */}
        <div
          className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[#313036] bg-[#1f1e24] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#313036] px-5 py-4">
            <h3 className="text-sm font-semibold text-[#ececef]">Filters</h3>
            <button
              type="button"
              onClick={() => setFilterModalOpen(false)}
              title="Close"
              className="flex items-center rounded p-1 text-[#6b6875] transition-colors hover:text-[#ececef]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Section: Construction manager */}
          <div className="px-5 py-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#6b6875]">
              Construction manager
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setPendingManagerId(null)}
                className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  pendingManagerId === null
                    ? "bg-[#252e3d] text-accent"
                    : "text-[#a09fa6] hover:bg-[#28272d] hover:text-[#ececef]"
                }`}
              >
                All managers
              </button>
              {managersWithSites.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[#4a4950]">No managers assigned yet</p>
              ) : (
                managersWithSites.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPendingManagerId(m.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                      pendingManagerId === m.id
                        ? "bg-[#252e3d] text-accent"
                        : "text-[#a09fa6] hover:bg-[#28272d] hover:text-[#ececef]"
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                    </svg>
                    {m.name}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[#313036] px-5 py-4">
            <button
              type="button"
              onClick={() => setPendingManagerId(null)}
              className="text-xs text-[#6b6875] transition-colors hover:text-[#a09fa6]"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => { setFilterManagerId(pendingManagerId); setFilterModalOpen(false); }}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
            >
              Apply
            </button>
          </div>
        </div>
      </>
    )}

  </DragDropContext>
  );
}
