// src/components/board/hooks/useBoardState.ts
//
// The assignment map itself: the DB-to-state rebuild effect, and every
// handler that mutates a cell (assign to site, split, merge, drag-and-drop).
//
// assignmentsState is touched by nearly every board feature, so its raw
// useState lives in BoardClient (not here) and is passed in — the same way
// useAvailability/useHolidays/useCopy receive it. What this hook actually
// owns is the rebuild effect and the mutation handlers around it.
//
// The rebuild effect also seeds availability/commentCounts/collapsedRows,
// which belong to other hooks/state. That's not a layering violation so
// much as an unavoidable fact: all four are one atomic "resync from fresh
// server props" operation gated by the same syncPendingRef/skippedRebuildRef
// guard, so splitting the guard across independent effects would risk the
// exact optimistic-state-clobbering bug this guard exists to prevent.

import { useEffect, useState } from "react";
import {
  getDayFromDroppableId,
  getProjectIdFromDroppableId,
  getDayPartFromDroppableId,
  isPoolHalfDroppableId,
  parseFromDraggableId,
  fullDayDroppableId,
  preLunchDroppableId,
  afterLunchDroppableId,
  poolFullDayId,
  poolHalfDayId,
} from "../boardIds";
import { availabilityKey } from "../availabilityKey";
import { addHalfToPool } from "../poolMerge";
import type { AvailabilityStatus, EmployeeEntry } from "../types";
import { DAYS, type DayName } from "~/lib/constants";
import { getDayNameFromDate } from "~/lib/week";
import { updateAssignment, splitAssignment, mergeAssignment } from "~/server/actions/board";
import type { Assignment, Availability, BoardWeek, DayPart, Employee, Project } from "~/types";
import type { SitePickerTarget } from "../types";
import type { DragStart, DropResult } from "@hello-pangea/dnd";

const COLLAPSED_LS_KEY = "gridspatch:collapsed-rows";

type UseBoardStateArgs = {
  dbProjects: Project[];
  dbEmployees: Employee[];
  dbAssignments: Assignment[];
  dbAvailability: Availability[];
  dbCommentCounts: Record<string, number>;
  selectedWeek: BoardWeek;
  weekDates: Record<DayName, string>;
  enqueue: (label: string, run: () => Promise<unknown>) => void;
  confirmPastEdit: (action: () => void | Promise<void>) => void;
  syncPendingRef: React.MutableRefObject<number>;
  skippedRebuildRef: React.MutableRefObject<boolean>;
  assignmentsState: Record<string, EmployeeEntry[]>;
  setAssignmentsState: React.Dispatch<React.SetStateAction<Record<string, EmployeeEntry[]>>>;
  setAvailability: React.Dispatch<React.SetStateAction<Record<string, AvailabilityStatus>>>;
  setCommentCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setCollapsedRows: React.Dispatch<React.SetStateAction<Set<string> | null>>;
  openCardId: string | null;
  setOpenCardId: React.Dispatch<React.SetStateAction<string | null>>;
  setSitePickerFor: React.Dispatch<React.SetStateAction<SitePickerTarget | null>>;
};

export function useBoardState({
  dbProjects,
  dbEmployees,
  dbAssignments,
  dbAvailability,
  dbCommentCounts,
  selectedWeek,
  weekDates,
  enqueue,
  confirmPastEdit,
  syncPendingRef,
  skippedRebuildRef,
  assignmentsState,
  setAssignmentsState,
  setAvailability,
  setCommentCounts,
  setCollapsedRows,
  setOpenCardId,
  setSitePickerFor,
}: UseBoardStateArgs) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [draggingDay, setDraggingDay] = useState<string | null>(null);
  const [draggingDayPart, setDraggingDayPart] = useState<DayPart | null>(null);

  // ── Assign a worker (from pool or another site) to a project site ─────────
  // sourceCellId may be a pool cell or a project cell (full-day or half-day).
  // dayPart is passed explicitly (the entry's own dayPart) rather than
  // inferred from sourceCellId — the pool has a single droppable per day that
  // can hold both full-day and half-day entries, so its id alone can't tell
  // them apart.
  const assignToSite = (employeeId: string, day: string, projectId: string, sourceCellId: string, dayPart: DayPart) => {
    const employee = dbEmployees.find((e) => e.id === employeeId);
    if (!employee) return;
    // Picking the site the employee is already on is a no-op.
    if (getProjectIdFromDroppableId(sourceCellId) === projectId) {
      setSitePickerFor(null);
      return;
    }
    confirmPastEdit(() => {
      const targetId =
        dayPart === "pre_lunch"
          ? preLunchDroppableId(projectId, day)
          : dayPart === "after_lunch"
            ? afterLunchDroppableId(projectId, day)
            : fullDayDroppableId(projectId, day);
      setAssignmentsState((prev) => {
        const next = { ...prev };
        next[sourceCellId] = (next[sourceCellId] ?? []).filter(
          (e) => !(e.employee.id === employeeId && e.dayPart === dayPart),
        );
        next[targetId] = [...(next[targetId] ?? []), { employee, dayPart }];
        return next;
      });
      setSitePickerFor(null);
      setOpenCardId(null);
      const dateIso = weekDates[day as DayName];
      if (dateIso) {
        const weekId = selectedWeek.id;
        enqueue("updateAssignment", () => updateAssignment(employeeId, projectId, dateIso, weekId, dayPart));
      }
    });
  };

  // ── Initialise state from DB ───────────────────────────────────────────────

  useEffect(() => {
    // Server props are stale while edits are still queued to be sent — rebuilding
    // now would silently discard optimistic state that hasn't reached the DB yet.
    // Remember the skip and re-fetch once the queue has drained.
    if (syncPendingRef.current > 0) {
      skippedRebuildRef.current = true;
      return;
    }

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
      state[poolHalfDayId(day)] = [];
    });

    // Build availability map first so unavailable employees/halves are
    // excluded from cells below. A full_day absence blocks the whole day; a
    // pre_lunch/after_lunch absence blocks only that half, leaving the other
    // half assignable (or free, going to the pool as a half card below).
    const initialAvailability: Record<string, AvailabilityStatus> = {};
    const absentFull = new Set<string>(); // `${employeeId}-${day}`
    const absentPre = new Set<string>();
    const absentPost = new Set<string>();
    dbAvailability.forEach((a) => {
      const dayName = getDayNameFromDate(a.date, selectedWeek.startDateIso);
      if (!dayName) return;
      const dayPart = a.dayPart ?? "full_day";
      initialAvailability[availabilityKey(a.employeeId, dayName, dayPart)] = a.status as AvailabilityStatus;
      const edKey = `${a.employeeId}-${dayName}`;
      if (dayPart === "full_day") absentFull.add(edKey);
      else if (dayPart === "pre_lunch") absentPre.add(edKey);
      else absentPost.add(edKey);
    });
    setAvailability(initialAvailability);

    // Track which halves are already covered by a project assignment, and
    // which employees are fully covered by a full_day project assignment.
    const assignedPre = new Set<string>(); // `${employeeId}-${day}`
    const assignedPost = new Set<string>();
    const fullDayProjectAssigned = new Set<string>();

    dbAssignments.forEach((assignment) => {
      const dayName = getDayNameFromDate(assignment.date, selectedWeek.startDateIso);
      if (!dayName) return;
      const employee = dbEmployees.find((e) => e.id === assignment.employeeId);
      if (!employee) return;

      const edKey = `${assignment.employeeId}-${dayName}`;
      // A full-day absence wins outright, regardless of what dayPart this is.
      if (absentFull.has(edKey)) return;

      if (assignment.dayPart === "full_day") {
        if (absentPre.has(edKey) || absentPost.has(edKey)) return; // defensive: shouldn't coexist
        if (assignment.projectId) {
          fullDayProjectAssigned.add(edKey);
          const cellId = fullDayDroppableId(assignment.projectId, dayName);
          state[cellId] = [...(state[cellId] ?? []), { employee, dayPart: "full_day" }];
        }
      } else if (assignment.dayPart === "pre_lunch") {
        if (absentPre.has(edKey)) return;
        assignedPre.add(edKey);
        if (assignment.projectId) {
          const cellId = preLunchDroppableId(assignment.projectId, dayName);
          state[cellId] = [...(state[cellId] ?? []), { employee, dayPart: "pre_lunch" }];
        }
      } else if (assignment.dayPart === "after_lunch") {
        if (absentPost.has(edKey)) return;
        assignedPost.add(edKey);
        if (assignment.projectId) {
          const cellId = afterLunchDroppableId(assignment.projectId, dayName);
          state[cellId] = [...(state[cellId] ?? []), { employee, dayPart: "after_lunch" }];
        }
      }
    });

    // Whatever's left goes to the pool: a full-day card when neither half is
    // taken (assigned or absent), a half card when exactly one half is free,
    // nothing when both halves are accounted for elsewhere.
    dbEmployees.forEach((employee) => {
      DAYS.forEach((day) => {
        const edKey = `${employee.id}-${day}`;
        if (absentFull.has(edKey) || fullDayProjectAssigned.has(edKey)) return;
        const preTaken = assignedPre.has(edKey) || absentPre.has(edKey);
        const postTaken = assignedPost.has(edKey) || absentPost.has(edKey);
        if (!preTaken && !postTaken) {
          state[poolFullDayId(day)] = [...(state[poolFullDayId(day)] ?? []), { employee, dayPart: "full_day" }];
        } else if (!preTaken) {
          state[poolHalfDayId(day)] = [...(state[poolHalfDayId(day)] ?? []), { employee, dayPart: "pre_lunch" }];
        } else if (!postTaken) {
          state[poolHalfDayId(day)] = [...(state[poolHalfDayId(day)] ?? []), { employee, dayPart: "after_lunch" }];
        }
      });
    });

    setAssignmentsState(state);
    setCommentCounts(dbCommentCounts);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncPending is read via ref on purpose: the queue draining must not trigger a rebuild from stale server props
  }, [dbProjects, dbEmployees, dbAssignments, dbAvailability, dbCommentCounts, selectedWeek.startDateIso]);

  // ── Split day ─────────────────────────────────────────────────────────────
  // Only allowed from project cells (pool cards don't have a split button).

  const splitDay = (employeeId: string, day: string, sourceCellId: string) => {
    const employee = dbEmployees.find((e) => e.id === employeeId);
    if (!employee) return;
    const projectId = getProjectIdFromDroppableId(sourceCellId);
    if (!projectId) return;
    confirmPastEdit(() => {
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
      const dateIso = weekDates[day as DayName];
      if (dateIso) {
        const weekId = selectedWeek.id;
        enqueue("splitAssignment", () => splitAssignment(employeeId, projectId, dateIso, weekId));
      }
    });
  };

  // ── Merge day ─────────────────────────────────────────────────────────────

  const mergeDay = (employeeId: string, day: string, sourceCellId: string) => {
    const employee = dbEmployees.find((e) => e.id === employeeId);
    if (!employee) return;
    const projectId = getProjectIdFromDroppableId(sourceCellId);
    const fdId = projectId ? fullDayDroppableId(projectId, day) : poolFullDayId(day);
    confirmPastEdit(() => {
      setAssignmentsState((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (getDayFromDroppableId(key) === day) {
            next[key] = (next[key] ?? []).filter((e) => e.employee.id !== employeeId);
          }
        }
        next[fdId] = [...(next[fdId] ?? []), { employee, dayPart: "full_day" }];
        return next;
      });
      setOpenCardId(null);
      const dateIso = weekDates[day as DayName];
      if (dateIso) {
        const weekId = selectedWeek.id;
        enqueue("mergeAssignment", () => mergeAssignment(employeeId, projectId, dateIso, weekId));
      }
    });
  };

  // ── Drag and drop ─────────────────────────────────────────────────────────

  const onDragStart = (start: DragStart) => {
    setDraggingDay(getDayFromDroppableId(start.source.droppableId) || null);
    setDraggingDayPart(parseFromDraggableId(start.draggableId).dayPart);
    setOpenCardId(null);
  };

  const onDragEnd = (result: DropResult) => {
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
      const reordered = [...sourceList];
      reordered.splice(destination.index, 0, removed);
      confirmPastEdit(() => {
        setAssignmentsState((prev) => ({ ...prev, [source.droppableId]: reordered }));
      });
      return;
    }

    // The pool's half-day droppable holds both AM and PM cards at once, so
    // (unlike every other droppable) its own id can't dictate a dayPart —
    // a card dropped there keeps whatever half it was dragged as.
    const droppingIntoHalfPool = isPoolHalfDroppableId(destination.droppableId);
    const destDayPart = droppingIntoHalfPool
      ? parseFromDraggableId(draggableId).dayPart
      : getDayPartFromDroppableId(destination.droppableId);

    const { employeeId, dayPart: sourceDayPart } = parseFromDraggableId(draggableId);
    const targetProjectId = getProjectIdFromDroppableId(destination.droppableId);
    const targetDateIso = weekDates[destinationDay as DayName];

    confirmPastEdit(() => {
      setAssignmentsState((prev) => {
        const withSourceRemoved = { ...prev, [source.droppableId]: sourceList };
        if (droppingIntoHalfPool && (destDayPart === "pre_lunch" || destDayPart === "after_lunch")) {
          // Merges with the sibling half if it's already a free pool card.
          return addHalfToPool(withSourceRemoved, destinationDay, removed.employee, destDayPart);
        }
        const destList = [...(withSourceRemoved[destination.droppableId] ?? [])];
        destList.splice(destination.index, 0, { ...removed, dayPart: destDayPart });
        return { ...withSourceRemoved, [destination.droppableId]: destList };
      });
      if (targetDateIso) {
        const weekId = selectedWeek.id;
        // Two ops for a half-day move must land in this order; the serial queue
        // guarantees that without needing to await here.
        if (sourceDayPart !== destDayPart && sourceDayPart !== "full_day") {
          enqueue("updateAssignment:clearHalf", () => updateAssignment(employeeId, null, targetDateIso, weekId, sourceDayPart));
        }
        enqueue("updateAssignment", () => updateAssignment(employeeId, targetProjectId, targetDateIso, weekId, destDayPart));
      }
    });
  };

  return {
    isLoaded,
    draggingDay,
    draggingDayPart,
    assignToSite,
    splitDay,
    mergeDay,
    onDragStart,
    onDragEnd,
  };
}
