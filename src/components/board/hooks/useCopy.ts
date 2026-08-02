// src/components/board/hooks/useCopy.ts
//
// Copy-day (site-selective, two variants) and copy-previous-week state and
// actions.
//
// Both day-copy variants share applyScopedDayCopy (copyScoped.ts) for the
// optimistic state update and copyDayAssignments/copySiteDayAssignments
// (same server implementation) for persistence — variant 1 (the dialog)
// passes whichever sites the planner checked, variant 2 (the per-site cell
// control) always passes a single-element list. Neither variant copies
// availability (sick/vacation/school) — see copyWeekAssignments below for
// why that's also true for the week-copy path.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fullDayDroppableId, preLunchDroppableId, afterLunchDroppableId } from "../boardIds";
import { applyScopedDayCopy } from "../copyScoped";
import type { AvailabilityStatus, EmployeeEntry, SiteDayCopyTarget } from "../types";
import type { DayName } from "~/lib/constants";
import type { Assignment, BoardWeek, Employee, Project } from "~/types";
import { copyDayAssignments, copySiteDayAssignments, copyWeekAssignments } from "~/server/actions/board";

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
  const [siteCopyDialog, setSiteCopyDialog] = useState<{ sourceDay: string; targetDay: string } | null>(null);
  const [siteCopyResult, setSiteCopyResult] = useState<number | null>(null);
  const [copyWeekModalOpen, setCopyWeekModalOpen] = useState(false);
  const [siteDayCopyFor, setSiteDayCopyFor] = useState<SiteDayCopyTarget | null>(null);
  const [siteDayCopyConfirm, setSiteDayCopyConfirm] = useState<{ projectId: string; sourceDay: string; targetDay: string } | null>(null);
  const [siteDayCopyResult, setSiteDayCopyResult] = useState<number | null>(null);

  // ── Close popovers on outside click or Escape ─────────────────────────────
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

  const closeSiteDayCopy = () => {
    setSiteDayCopyFor(null);
    setSiteDayCopyConfirm(null);
    setSiteDayCopyResult(null);
  };

  useEffect(() => {
    if (!siteDayCopyFor) return;
    const handleClick = () => closeSiteDayCopy();
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSiteDayCopy(); };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [siteDayCopyFor]);

  // ── Previous week (for copy-week feature) ────────────────────────────────
  const previousWeek = useMemo(() => {
    const selectedStart = new Date(selectedWeek.startDateIso).getTime();
    return weeks.find((w) => new Date(w.startDateIso).getTime() < selectedStart) ?? null;
  }, [weeks, selectedWeek.startDateIso]);

  const targetWeekHasAssignments = dbAssignments.some((a) => a.projectId !== null);

  // ── Site-selective day copy (variant 1: dialog over every visible site) ───

  const projectDayCount = (projectId: string, day: string): number =>
    (assignmentsState[fullDayDroppableId(projectId, day)] ?? []).length +
    (assignmentsState[preLunchDroppableId(projectId, day)] ?? []).length +
    (assignmentsState[afterLunchDroppableId(projectId, day)] ?? []).length;

  // Opens the site-selection dialog instead of copying immediately — replaces
  // the old unconditional overwrite-confirm modal.
  const requestCopyDay = (sourceDay: string, targetDay: string) => {
    setCopyPopoverDay(null);
    setSiteCopyResult(null);
    setSiteCopyDialog({ sourceDay, targetDay });
  };

  const closeSiteCopyDialog = () => {
    setSiteCopyDialog(null);
    setSiteCopyResult(null);
  };

  const confirmSiteCopy = (projectIds: string[]) => {
    if (!siteCopyDialog || projectIds.length === 0) return;
    const { sourceDay, targetDay } = siteCopyDialog;
    confirmPastEdit(() => {
      const { state, skipped } = applyScopedDayCopy(
        assignmentsState,
        dbProjects,
        dbEmployees,
        availability,
        projectIds,
        sourceDay,
        targetDay,
      );
      setAssignmentsState(state);
      setSiteCopyResult(skipped);

      const sourceDateIso = weekDates[sourceDay as DayName];
      const targetDateIso = weekDates[targetDay as DayName];
      if (sourceDateIso && targetDateIso) {
        const weekId = selectedWeek.id;
        enqueue("copyDayAssignments", () => copyDayAssignments(sourceDateIso, targetDateIso, weekId, projectIds));
      }
    });
  };

  // ── Per-site day copy (variant 2: control on the site's own day cell) ────

  // Only closes the popover immediately when no confirmation step is needed —
  // otherwise it stays open, showing the inline overwrite-confirm instead.
  // (copySiteDay itself decides whether to close or show a skipped-count
  // result, so it doesn't close here either.)
  const requestSiteDayCopy = (projectId: string, sourceDay: string, targetDay: string) => {
    if (projectDayCount(projectId, targetDay) > 0) {
      setSiteDayCopyConfirm({ projectId, sourceDay, targetDay });
    } else {
      copySiteDay(projectId, sourceDay, targetDay);
    }
  };

  const copySiteDay = (projectId: string, sourceDay: string, targetDay: string) => {
    confirmPastEdit(() => {
      const { state, skipped } = applyScopedDayCopy(
        assignmentsState,
        dbProjects,
        dbEmployees,
        availability,
        [projectId],
        sourceDay,
        targetDay,
      );
      setAssignmentsState(state);
      setSiteDayCopyConfirm(null);
      // Nothing to report — close immediately. Otherwise keep the popover
      // open showing the skipped count until the planner dismisses it.
      if (skipped > 0) {
        setSiteDayCopyResult(skipped);
      } else {
        setSiteDayCopyFor(null);
        setSiteDayCopyResult(null);
      }

      const sourceDateIso = weekDates[sourceDay as DayName];
      const targetDateIso = weekDates[targetDay as DayName];
      if (sourceDateIso && targetDateIso) {
        const weekId = selectedWeek.id;
        enqueue("copySiteDayAssignments", () => copySiteDayAssignments(projectId, sourceDateIso, targetDateIso, weekId));
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
    siteCopyDialog,
    siteCopyResult,
    projectDayCount,
    requestCopyDay,
    confirmSiteCopy,
    closeSiteCopyDialog,
    siteDayCopyFor,
    setSiteDayCopyFor,
    siteDayCopyConfirm,
    setSiteDayCopyConfirm,
    siteDayCopyResult,
    closeSiteDayCopy,
    requestSiteDayCopy,
    copySiteDay,
    copyWeekModalOpen,
    setCopyWeekModalOpen,
    previousWeek,
    targetWeekHasAssignments,
    copyPreviousWeek,
  };
}
