// src/components/board/hooks/useCopy.ts
//
// Copy-day and copy-previous-week state and actions. Both overwrite the
// target and both gate behind a confirmation when the target already holds
// assignments that would be lost.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fullDayDroppableId,
  preLunchDroppableId,
  afterLunchDroppableId,
  poolFullDayId,
} from "../boardIds";
import { parseAvailabilityKey } from "../availabilityKey";
import type { AvailabilityStatus, EmployeeEntry } from "../types";
import type { DayName } from "~/lib/constants";
import type { Assignment, BoardWeek, DayPart, Employee, Project } from "~/types";
import { copyDayAssignments, copyWeekAssignments } from "~/server/actions/board";

type UseCopyArgs = {
  dbProjects: Project[];
  dbEmployees: Employee[];
  dbAssignments: Assignment[];
  weeks: BoardWeek[];
  selectedWeek: BoardWeek;
  weekDates: Record<DayName, string>;
  assignmentsState: Record<string, EmployeeEntry[]>;
  setAssignmentsState: React.Dispatch<React.SetStateAction<Record<string, EmployeeEntry[]>>>;
  availability: Record<string, AvailabilityStatus>;
  enqueue: (label: string, run: () => Promise<unknown>) => void;
  confirmPastEdit: (action: () => void | Promise<void>) => void;
  setSideMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useCopy({
  dbProjects,
  dbEmployees,
  dbAssignments,
  weeks,
  selectedWeek,
  weekDates,
  assignmentsState,
  setAssignmentsState,
  availability,
  enqueue,
  confirmPastEdit,
  setSideMenuOpen,
}: UseCopyArgs) {
  const router = useRouter();

  const [copyPopoverDay, setCopyPopoverDay] = useState<string | null>(null);
  const [dayCopyConfirm, setDayCopyConfirm] = useState<{ sourceDay: string; targetDay: string } | null>(null);
  const [copyWeekModalOpen, setCopyWeekModalOpen] = useState(false);

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

  // ── Previous week (for copy-week feature) ────────────────────────────────
  const previousWeek = useMemo(() => {
    const selectedStart = new Date(selectedWeek.startDateIso).getTime();
    return weeks.find((w) => new Date(w.startDateIso).getTime() < selectedStart) ?? null;
  }, [weeks, selectedWeek.startDateIso]);

  const targetWeekHasAssignments = dbAssignments.some((a) => a.projectId !== null);

  // ── Copy day ──────────────────────────────────────────────────────────────

  const dayHasAssignments = (day: string) =>
    dbProjects.some(
      (project) =>
        (assignmentsState[fullDayDroppableId(project.id, day)] ?? []).length > 0 ||
        (assignmentsState[preLunchDroppableId(project.id, day)] ?? []).length > 0 ||
        (assignmentsState[afterLunchDroppableId(project.id, day)] ?? []).length > 0,
    );

  // Gate before overwriting: only prompt when the target day already has
  // assignments that would be lost — mirrors the week-copy warning.
  const requestCopyDay = (sourceDay: string, targetDay: string) => {
    setCopyPopoverDay(null);
    if (dayHasAssignments(targetDay)) {
      setDayCopyConfirm({ sourceDay, targetDay });
    } else {
      copyDay(sourceDay, targetDay);
    }
  };

  const copyDay = (sourceDay: string, targetDay: string) => {
    confirmPastEdit(() => {
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
            .map((key) => parseAvailabilityKey(key))
            .filter((parsed) => parsed !== null && parsed.day === targetDay)
            .map((parsed) => parsed!.employeeId),
        );

        next[poolFullDayId(targetDay)] = dbEmployees
          .filter((e) => !assignedInTarget.has(e.id) && !unavailableInTarget.has(e.id))
          .map((e) => ({ employee: e, dayPart: "full_day" as DayPart }));

        return next;
      });

      setCopyPopoverDay(null);
      const sourceDateIso = weekDates[sourceDay as DayName];
      const targetDateIso = weekDates[targetDay as DayName];
      if (sourceDateIso && targetDateIso) {
        const weekId = selectedWeek.id;
        enqueue("copyDayAssignments", () => copyDayAssignments(sourceDateIso, targetDateIso, weekId));
      }
    });
  };

  // ── Copy previous week ───────────────────────────────────────────────────

  const copyPreviousWeek = () => {
    if (!previousWeek) return;
    confirmPastEdit(() => {
      setCopyWeekModalOpen(false);
      setSideMenuOpen(false);
      const { id: sourceWeekId, startDateIso: sourceStartIso } = previousWeek;
      const { id: targetWeekId, startDateIso: targetStartIso } = selectedWeek;
      enqueue("copyWeekAssignments", () =>
        copyWeekAssignments(sourceWeekId, targetWeekId, sourceStartIso, targetStartIso).then(() => {
          router.refresh();
        }),
      );
    });
  };

  return {
    copyPopoverDay,
    setCopyPopoverDay,
    dayCopyConfirm,
    setDayCopyConfirm,
    copyWeekModalOpen,
    setCopyWeekModalOpen,
    previousWeek,
    targetWeekHasAssignments,
    requestCopyDay,
    copyDay,
    copyPreviousWeek,
  };
}
