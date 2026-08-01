"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import type { DragStart } from "@hello-pangea/dnd";

import { EmployeeCard } from "./EmployeeCard";
import { StatusChip } from "./StatusChip";
import {
  getDraggableId,
  fullDayDroppableId,
  preLunchDroppableId,
  afterLunchDroppableId,
  poolFullDayId,
} from "./boardIds";
import { SyringeIcon, PalmTreeIcon, CopyIcon, FilterIcon, GearIcon } from "~/components/icons";
import { Sidebar } from "~/components/Sidebar";
import { clearProjectAssignmentsForWeek } from "~/server/actions/board";
import { useHolidays } from "./hooks/useHolidays";
import { useAvailability } from "./hooks/useAvailability";
import { useCopy } from "./hooks/useCopy";
import { useBoardState } from "./hooks/useBoardState";
import { SitePickerPopover } from "./modals/SitePickerPopover";
import { CommentsDialog } from "./modals/CommentsDialog";
import { CopyWeekModal } from "./modals/CopyWeekModal";
import { DayCopyConfirmModal } from "./modals/DayCopyConfirmModal";
import { FilterModal } from "./modals/FilterModal";
import { HoldConfirmModal } from "./modals/HoldConfirmModal";
import { CompleteConfirmModal } from "./modals/CompleteConfirmModal";
import { PastWeekModal } from "./modals/PastWeekModal";
import { DAYS } from "~/lib/constants";
import {
  getCurrentWeekStart,
  getNextWeekParam,
  getPreviousWeekParam,
  getWeekDateMap,
  toDateParam,
} from "~/lib/week";
import type { Assignment, Availability, BoardWeek, Employee, Holiday, Project, ProjectStatus } from "~/types";
import { getSuperStatus } from "~/types";
import { setSiteTransition } from "~/server/actions/sites";
import { saveThemePreference } from "~/server/actions/preferences";
import { reportClientError } from "~/server/actions/errors";
import { listComments, addComment, deleteComment, type EmployeeDayCommentDto } from "~/server/actions/comments";
import { useMutationQueue } from "./mutationQueue";
import type { AvailabilityStatus, EmployeeEntry, SitePickerTarget } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BoardClientProps {
  dbProjects: Project[];
  dbEmployees: Employee[];
  dbAssignments: Assignment[];
  dbAvailability: Availability[];
  dbHolidays: Holiday[];
  /** Comment count per employee/day, keyed by `${employeeId}::${dateIso}` — full text is fetched on demand. */
  dbCommentCounts: Record<string, number>;
  weekStatusMap: Record<string, string>;
  selectedWeek: BoardWeek;
  weeks: BoardWeek[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLLAPSED_LS_KEY  = "gridspatch:collapsed-rows";
const FILTER_MANAGER_KEY = "gridspatch:filter-manager";
const PAST_WEEK_MUTE_KEY = "gridspatch:past-week-mute-until";
const POOL_HEIGHT_LS_KEY = "gridspatch:pool-height";
const POOL_DEFAULT_HEIGHT = 200;
const POOL_MIN_HEIGHT = 60;
const POOL_MAX_HEIGHT = 600;

// ── Theme toggle ──────────────────────────────────────────────────────────────

function ThemeToggle() {
  const t = useTranslations("Board");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme((document.documentElement.getAttribute("data-theme") ?? "dark") as "dark" | "light");
  }, []);

  const toggle = async () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    await saveThemePreference(next);
    startTransition(() => router.refresh());
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      title={theme === "dark" ? t("switchToLight") : t("switchToDark")}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BoardClient({
  dbProjects,
  dbEmployees,
  dbAssignments,
  dbAvailability,
  dbHolidays,
  dbCommentCounts,
  weekStatusMap,
  selectedWeek,
  weeks,
}: BoardClientProps) {
  const router = useRouter();
  const t = useTranslations("Board");
  const locale = useLocale();
  const [navSidebarOpen, setNavSidebarOpen] = useState(false);
  const [assignmentsState, setAssignmentsState] = useState<Record<string, EmployeeEntry[]>>({});
  const [activeDay, setActiveDay] = useState("Monday");
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);
  const [dayDropdownOpen, setDayDropdownOpen] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [commentsFor, setCommentsFor] = useState<{ employeeId: string; day: string } | null>(null);
  const [commentsList, setCommentsList] = useState<EmployeeDayCommentDto[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState(false);
  const [collapsedRows, setCollapsedRows] = useState<Set<string> | null>(null);
  const [sitePickerFor, setSitePickerFor] = useState<SitePickerTarget | null>(null);
  const [filterManagerId, setFilterManagerId] = useState<string | null>(null);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [pendingManagerId, setPendingManagerId] = useState<string | null>(null);
  const poolOverlayRef = useRef<HTMLDivElement>(null);
  const poolHeightRef = useRef(POOL_DEFAULT_HEIGHT);
  const [statusPopoverProjectId, setStatusPopoverProjectId] = useState<string | null>(null);
  const [completingTransition, setCompletingTransition] = useState<{
    projectId: string; status: ProjectStatus; assignmentCount: number;
  } | null>(null);
  const [holdingTransition, setHoldingTransition] = useState<{
    projectId: string; assignmentCount: number;
  } | null>(null);
  const [applyingStatusChange, setApplyingStatusChange] = useState(false);

  // ── Mutation queue — serial, retrying, never blocks or resets the UI ──────
  const reportQueueError = (label: string, err: unknown, attempt: number) => {
    console.error(`[board] ${label} failed (attempt ${attempt})`, err);
    const message = err instanceof Error ? err.message : String(err);
    void reportClientError(label, message, attempt).catch((e) => console.error("[board] reportClientError failed", e));
  };
  const { enqueue, status: syncStatus, pending: syncPending, attempt: syncAttempt } = useMutationQueue(reportQueueError);

  useEffect(() => {
    if (syncPending === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [syncPending]);

  // The rebuild effect must not re-run when the queue drains — server props are
  // unchanged then and rebuilding would snap optimistic edits back. It reads
  // pending state through this ref instead of depending on syncPending.
  const syncPendingRef = useRef(0);
  syncPendingRef.current = syncPending;
  const skippedRebuildRef = useRef(false);

  // Brief "Saved" flash once the queue drains back to empty; if fresh server
  // props arrived while edits were in flight, pull them in now via refresh.
  const [justSaved, setJustSaved] = useState(false);
  const wasPendingRef = useRef(false);
  useEffect(() => {
    const wasPending = wasPendingRef.current;
    wasPendingRef.current = syncPending > 0;
    if (wasPending && syncPending === 0) {
      if (skippedRebuildRef.current) {
        skippedRebuildRef.current = false;
        router.refresh();
      }
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [syncPending, router]);

  const isPastWeek = selectedWeek.startDateIso < toDateParam(getCurrentWeekStart());
  const [mutedUntil, setMutedUntil] = useState<number>(() =>
    typeof window !== "undefined" ? Number(localStorage.getItem(PAST_WEEK_MUTE_KEY) ?? 0) : 0,
  );
  const isMuted = mutedUntil > Date.now();
  const muteWarning = () => {
    const until = Date.now() + 5 * 60 * 1000;
    localStorage.setItem(PAST_WEEK_MUTE_KEY, String(until));
    setMutedUntil(until);
  };

  useEffect(() => {
    if (!isMuted) return;
    const t = setTimeout(() => setMutedUntil(0), mutedUntil - Date.now());
    return () => clearTimeout(t);
  }, [isMuted, mutedUntil]);

  const [pendingAction, setPendingAction] = useState<(() => void | Promise<void>) | null>(null);
  const [showPastWeekModal, setShowPastWeekModal] = useState(false);

  const confirmPastEdit = (action: () => void | Promise<void>) => {
    if (!isPastWeek || isMuted) { void action(); return; }
    setPendingAction(() => action);
    setShowPastWeekModal(true);
  };

  const executePending = (andMute = false) => {
    if (andMute) muteWarning();
    setShowPastWeekModal(false);
    if (pendingAction) void pendingAction();
    setPendingAction(null);
  };

  const weekDates = getWeekDateMap(selectedWeek.startDateIso);
  const commentKey = (employeeId: string, day: string) =>
    `${employeeId}::${weekDates[day as keyof typeof weekDates]}`;
  const dayLabel = (day: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
      new Date(weekDates[day as keyof typeof weekDates] ?? "1970-01-05"),
    );

  // ── Availability (sick / vacation) ───────────────────────────────────────

  const { availability, setAvailability, markAvailability, clearAvailability } = useAvailability({
    dbEmployees,
    weekDates,
    weekId: selectedWeek.id,
    enqueue,
    confirmPastEdit,
    setAssignmentsState,
    setOpenCardId,
  });

  // ── Core board state: assignment map, rebuild effect, drag/split/merge ────

  const {
    isLoaded,
    draggingDay,
    draggingDayPart,
    assignToSite,
    splitDay,
    mergeDay,
    onDragStart: onBoardDragStart,
    onDragEnd,
  } = useBoardState({
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
    openCardId,
    setOpenCardId,
    setSitePickerFor,
  });

  // onDragStart also needs to close the copy popover (owned by useCopy, called
  // below) — composed here rather than threading setCopyPopoverDay into
  // useBoardState just for this one cross-feature UI nicety.
  const onDragStart = (start: DragStart) => {
    onBoardDragStart(start);
    setCopyPopoverDay(null);
  };

  // ── Holiday state ─────────────────────────────────────────────────────────

  const {
    holidayPopoverDay,
    setHolidayPopoverDay,
    getHolidayType,
    isPublicHoliday,
    applyHoliday,
    removeHoliday,
  } = useHolidays({
    dbHolidays,
    dbEmployees,
    weekDates,
    weekId: selectedWeek.id,
    enqueue,
    setAssignmentsState,
    setAvailability,
  });

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

  // ── Close holiday popover on outside click or Escape ─────────────────────
  useEffect(() => {
    if (!holidayPopoverDay) return;
    const handleClick = () => setHolidayPopoverDay(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHolidayPopoverDay(null); };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [holidayPopoverDay, setHolidayPopoverDay]);

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

  // ── Comments dialog ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!commentsFor) { setCommentsList(null); return; }
    let cancelled = false;
    setCommentsList(null);
    setCommentError(false);
    const dateIso = weekDates[commentsFor.day as keyof typeof weekDates];
    if (!dateIso) return;
    listComments(commentsFor.employeeId, dateIso)
      .then((list) => { if (!cancelled) setCommentsList(list); })
      .catch(() => { if (!cancelled) setCommentError(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weekDates is a fresh object every render; depending on it would refetch on every re-render instead of only when the dialog target or week changes
  }, [commentsFor, selectedWeek.startDateIso]);

  const closeComments = () => {
    setCommentsFor(null);
    setCommentsList(null);
    setCommentDraft("");
    setCommentError(false);
  };

  const submitComment = () => {
    if (!commentsFor || !commentDraft.trim()) return;
    const dateIso = weekDates[commentsFor.day as keyof typeof weekDates];
    if (!dateIso) return;
    const { employeeId } = commentsFor;
    const key = commentKey(employeeId, commentsFor.day);
    setCommentSaving(true);
    setCommentError(false);
    addComment(employeeId, dateIso, commentDraft)
      .then((created) => {
        setCommentsList((prev) => [...(prev ?? []), created]);
        setCommentCounts((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
        setCommentDraft("");
      })
      .catch(() => setCommentError(true))
      .finally(() => setCommentSaving(false));
  };

  const removeComment = (commentId: string) => {
    if (!commentsFor) return;
    const key = commentKey(commentsFor.employeeId, commentsFor.day);
    setCommentsList((prev) => (prev ?? []).filter((c) => c.id !== commentId));
    setCommentCounts((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 1) - 1) }));
    deleteComment(commentId).catch(() => setCommentError(true));
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

  // ── Pool height — hydrate from localStorage ───────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(POOL_HEIGHT_LS_KEY);
    if (stored) {
      const h = Number(stored);
      if (!isNaN(h) && h >= POOL_MIN_HEIGHT && h <= POOL_MAX_HEIGHT) {
        poolHeightRef.current = h;
        if (poolOverlayRef.current) poolOverlayRef.current.style.maxHeight = `${h}px`;
      }
    }
  }, []);

  const handlePoolResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    // Pointer capture keeps every subsequent event routed to this handle — without it,
    // touch drags get hijacked by the browser as a page-scroll gesture partway through,
    // and the sequence can be interrupted by whatever element the pointer happens to be over.
    handle.setPointerCapture(e.pointerId);

    const startY = e.clientY;
    const startH = poolHeightRef.current;

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const h = Math.min(POOL_MAX_HEIGHT, Math.max(POOL_MIN_HEIGHT, startH + (startY - ev.clientY)));
      poolHeightRef.current = h;
      if (poolOverlayRef.current) poolOverlayRef.current.style.maxHeight = `${h}px`;
    };

    const onUp = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      localStorage.setItem(POOL_HEIGHT_LS_KEY, String(poolHeightRef.current));
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

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

  // ── Close status popover on outside click or Escape ─────────────────────
  useEffect(() => {
    if (!statusPopoverProjectId) return;
    const handleClick = () => setStatusPopoverProjectId(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setStatusPopoverProjectId(null); };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [statusPopoverProjectId]);

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

  // ── Effective per-week status ─────────────────────────────────────────────
  const effectiveStatus = (project: Project): ProjectStatus =>
    ((weekStatusMap[project.id] ?? project.status) as ProjectStatus);

  // ── Active filter label ───────────────────────────────────────────────────
  const activeManagerName = filterManagerId
    ? (managersWithSites.find((m) => m.id === filterManagerId)?.name ?? null)
    : null;

  // ── Filtered projects ─────────────────────────────────────────────────────
  const visibleProjects = filterManagerId
    ? dbProjects.filter((p) => p.constructionManagerId === filterManagerId)
    : dbProjects;

  // ── Card toggle ───────────────────────────────────────────────────────────

  const toggleOpenCard = (cardId: string) =>
    setOpenCardId((prev) => (prev === cardId ? null : cardId));

  // ── Copy day / copy previous week ──────────────────────────────────────────

  const {
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
  } = useCopy({
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
  });

  // ── Quick status change ───────────────────────────────────────────────────

  const countProjectAssignments = (projectId: string) => {
    let n = 0;
    for (const day of DAYS) {
      n += (assignmentsState[fullDayDroppableId(projectId, day)] ?? []).length;
      n += (assignmentsState[preLunchDroppableId(projectId, day)] ?? []).length;
      n += (assignmentsState[afterLunchDroppableId(projectId, day)] ?? []).length;
    }
    return n;
  };

  const handleStatusTransition = (projectId: string, toStatus: ProjectStatus) => {
    setStatusPopoverProjectId(null);
    if (getSuperStatus(toStatus) === "completed") {
      setCompletingTransition({ projectId, status: toStatus, assignmentCount: countProjectAssignments(projectId) });
      return;
    }
    if (toStatus === "on_hold") {
      const count = countProjectAssignments(projectId);
      if (count > 0) {
        setHoldingTransition({ projectId, assignmentCount: count });
        return;
      }
    }
    setApplyingStatusChange(true);
    void setSiteTransition(projectId, selectedWeek.param, toStatus).then(() => {
      router.refresh();
    }).finally(() => setApplyingStatusChange(false));
  };

  const handleConfirmComplete = async () => {
    if (!completingTransition) return;
    setApplyingStatusChange(true);
    try {
      await setSiteTransition(completingTransition.projectId, selectedWeek.param, completingTransition.status, true);
      setCompletingTransition(null);
      router.refresh();
    } finally {
      setApplyingStatusChange(false);
    }
  };

  const handleConfirmHold = async () => {
    if (!holdingTransition) return;
    setApplyingStatusChange(true);
    try {
      await setSiteTransition(holdingTransition.projectId, selectedWeek.param, "on_hold");
      await clearProjectAssignmentsForWeek(holdingTransition.projectId, selectedWeek.id);
      setAssignmentsState((prev) => {
        const next = { ...prev };
        for (const day of DAYS) {
          next[fullDayDroppableId(holdingTransition.projectId, day)] = [];
          next[preLunchDroppableId(holdingTransition.projectId, day)] = [];
          next[afterLunchDroppableId(holdingTransition.projectId, day)] = [];
        }
        return next;
      });
      setHoldingTransition(null);
      router.refresh();
    } finally {
      setApplyingStatusChange(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isLoaded) return <div className="p-10 text-[var(--color-text-primary)] bg-[var(--color-bg-page)]">{t("loading")}</div>;

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
    const isPubHoliday = isPublicHoliday(day);

    const hasAm = (assignmentsState[preId]  ?? []).length > 0;
    const hasPm = (assignmentsState[postId] ?? []).length > 0;
    const hasHalves = hasAm || hasPm;

    // showHalfSection drives LAYOUT (size/padding/divider/labels) and only
    // toggles when halves actually exist — never on drag — so @hello-pangea/dnd's
    // cached droppable positions don't go stale mid-drag from a layout shift.
    // showDropHint surfaces the AM/PM zones during a half-day drag without
    // resizing them: opacity + background only.
    const showHalfSection = hasHalves;
    const showDropHint = isDraggingHalfHere && !hasHalves;

    return (
      <div
        key={day}
        className={`day-cell w-full lg:min-w-max lg:flex-1 flex flex-col rounded-md border transition-opacity duration-150 overflow-hidden ${
          day === activeDay ? "" : "hidden"
        } lg:flex lg:flex-col ${
          isDimmed ? "opacity-30 border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]"
          : isPubHoliday ? "opacity-50 border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]"
          : "border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]"
        }`}
      >
        {/* Full-day section */}
        <Droppable droppableId={fdId} type={day} isDropDisabled={isPubHoliday}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`flex-1 min-h-[56px] p-2.5 flex flex-col gap-2.5 transition-colors ${
                snapshot.isDraggingOver
                  ? "bg-[var(--color-bg-hover)]"
                  : isDraggingFullHere
                    ? "bg-[var(--color-nav-active-bg)]"
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
                  onAssignToSite={isPubHoliday ? undefined : (anchor) => {
                    setOpenCardId(null);
                    setSitePickerFor({ employeeId: entry.employee.id, day, sourceCellId: fdId, ...anchor });
                  }}
                  commentCount={commentCounts[commentKey(entry.employee.id, day)] ?? 0}
                  onOpenComments={() => { setOpenCardId(null); setCommentsFor({ employeeId: entry.employee.id, day }); }}
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
            isDropDisabled={isPubHoliday || draggingDayPart === "after_lunch"}
          >
            {(provided, snapshot) => {
              return (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`half-day-col flex flex-col gap-2 transition-all ${
                    showHalfSection ? "p-2 pb-2.5 half-col-visible" : "half-col-collapsed"
                  } ${showHalfSection || showDropHint ? "" : "opacity-0"} ${
                    snapshot.isDraggingOver
                      ? "bg-[var(--am-zone-active)]"
                      : showHalfSection || showDropHint
                        ? "bg-[var(--am-zone)]"
                        : ""
                  }`}
                >
                  {showHalfSection && (
                    <div className="text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{t("am")}</div>
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
                      onAssignToSite={isPubHoliday ? undefined : (anchor) => {
                        setOpenCardId(null);
                        setSitePickerFor({ employeeId: entry.employee.id, day, sourceCellId: preId, ...anchor });
                      }}
                      commentCount={commentCounts[commentKey(entry.employee.id, day)] ?? 0}
                      onOpenComments={() => { setOpenCardId(null); setCommentsFor({ employeeId: entry.employee.id, day }); }}
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
            isDropDisabled={isPubHoliday || draggingDayPart === "pre_lunch"}
          >
            {(provided, snapshot) => {
              return (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`half-day-col flex flex-col gap-2 transition-all ${
                    showHalfSection ? "p-2 pb-2.5 half-col-visible" : "half-col-collapsed"
                  } ${showHalfSection || showDropHint ? "" : "opacity-0"} ${
                    snapshot.isDraggingOver
                      ? "bg-[var(--pm-zone-active)]"
                      : showHalfSection || showDropHint
                        ? "bg-[var(--pm-zone)]"
                        : ""
                  }`}
                >
                  {showHalfSection && (
                    <div className="text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{t("pm")}</div>
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
                      onAssignToSite={isPubHoliday ? undefined : (anchor) => {
                        setOpenCardId(null);
                        setSitePickerFor({ employeeId: entry.employee.id, day, sourceCellId: postId, ...anchor });
                      }}
                      commentCount={commentCounts[commentKey(entry.employee.id, day)] ?? 0}
                      onOpenComments={() => { setOpenCardId(null); setCommentsFor({ employeeId: entry.employee.id, day }); }}
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
    <div className="h-dvh bg-[var(--color-bg-page)] font-sans text-[var(--color-text-primary)] flex flex-col lg:flex-row">
      <Sidebar mobileOpen={navSidebarOpen} onMobileClose={() => setNavSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-h-0 min-w-0 lg:pl-14">

        {/* Mobile header — outside scroll area so content never scrolls behind it */}
        <div className="lg:hidden flex items-center gap-2 bg-[var(--color-bg-page)] px-4 pt-4 pb-2 shadow-[0_6px_0_6px_var(--color-bg-page)]">

          {/* Hamburger button — top-left */}
          <button
            type="button"
            onClick={() => setNavSidebarOpen(true)}
            title={t("openMenu")}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Day selector pill */}
          <div className="relative inline-flex items-center rounded-full bg-[var(--color-pill-bg)] text-sm font-medium text-[var(--color-text-secondary)]">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setDayDropdownOpen((o) => !o); }}
              className="flex items-center gap-1.5 px-4 py-2 text-[var(--color-text-primary)] transition hover:text-[var(--color-text-primary)]"
            >
              {dayLabel(activeDay)}
              <svg className="h-3 w-3 text-[var(--color-pill-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dayDropdownOpen && (
              <div className="absolute top-full left-0 z-50 mt-2 min-w-[160px] overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-xl">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => { setActiveDay(day); setDayDropdownOpen(false); }}
                    className={`block w-full text-left px-4 py-2.5 text-sm font-medium transition ${
                      day === activeDay
                        ? "bg-accent text-white"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    {dayLabel(day)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Week selector pill */}
          <div className="ml-auto relative inline-flex items-center rounded-full bg-[var(--color-pill-bg)] text-sm font-medium text-[var(--color-text-secondary)]">
            <Link
              href={`/board?week=${getPreviousWeekParam(selectedWeek.startDateIso)}`}
              className="px-3 py-2 transition hover:text-[var(--color-text-primary)]"
            >
              &#8249;
            </Link>
            <div className="h-4 w-px bg-[var(--color-pill-divider)]" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setWeekDropdownOpen((o) => !o); }}
              className="flex items-center gap-1.5 px-4 py-2 text-[var(--color-text-primary)] transition hover:text-[var(--color-text-primary)]"
            >
              {selectedWeek.label}
              <svg className="h-3 w-3 text-[var(--color-pill-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="h-4 w-px bg-[var(--color-pill-divider)]" />
            <Link
              href={`/board?week=${getNextWeekParam(selectedWeek.startDateIso)}`}
              className="px-3 py-2 transition hover:text-[var(--color-text-primary)]"
            >
              &#8250;
            </Link>
            {weekDropdownOpen && (
              <div className="absolute top-full right-0 z-50 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-xl">
                {weeks.map((week) => (
                  <Link
                    key={week.id}
                    href={`/board?week=${week.param}`}
                    onClick={() => setWeekDropdownOpen(false)}
                    className={`block px-4 py-2.5 text-sm font-medium transition ${
                      week.id === selectedWeek.id
                        ? "bg-accent text-white"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
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
        <div className="mt-4 mb-6 hidden lg:flex items-center justify-center bg-[var(--color-bg-page)] relative">
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <ThemeToggle />
          </div>
          <div className="relative inline-flex items-center rounded-full bg-[var(--color-pill-bg)] text-sm font-medium text-[var(--color-text-secondary)]">
            <Link
              href={`/board?week=${getPreviousWeekParam(selectedWeek.startDateIso)}`}
              className="px-3 py-2 transition hover:text-[var(--color-text-primary)]"
            >
              &#8249;
            </Link>
            <div className="h-4 w-px bg-[var(--color-pill-divider)]" />
            <button
              type="button"
              onClick={() => setWeekDropdownOpen((o) => !o)}
              className="flex items-center gap-1.5 px-4 py-2 text-[var(--color-text-primary)] transition hover:text-[var(--color-text-primary)]"
            >
              {selectedWeek.label}
              <svg className="h-3 w-3 text-[var(--color-pill-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="h-4 w-px bg-[var(--color-pill-divider)]" />
            <Link
              href={`/board?week=${getNextWeekParam(selectedWeek.startDateIso)}`}
              className="px-3 py-2 transition hover:text-[var(--color-text-primary)]"
            >
              &#8250;
            </Link>
            {weekDropdownOpen && (
              <div className="absolute top-full left-1/2 z-50 mt-2 min-w-[200px] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-xl">
                {weeks.map((week) => (
                  <Link
                    key={week.id}
                    href={`/board?week=${week.param}`}
                    onClick={() => setWeekDropdownOpen(false)}
                    className={`block px-4 py-2.5 text-sm font-medium transition ${
                      week.id === selectedWeek.id
                        ? "bg-accent text-white"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    {week.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>

          <div className="w-full lg:min-w-max flex flex-col gap-4">

            {/* Day headers — sticky so column labels stay visible while scrolling */}
            <div className="sticky top-0 z-20 hidden lg:flex gap-4 bg-[var(--color-bg-page)] -mt-4 pt-4 pb-2 shadow-[0_6px_0_6px_var(--color-bg-page)]">
              {DAYS.map((day) => {
                const holidayType = getHolidayType(day);
                const pubHoliday = holidayType === "public_holiday";
                return (
                  <div
                    key={day}
                    onClick={(e) => e.stopPropagation()}
                    className={`relative w-full lg:min-w-max lg:flex-1 rounded-md p-2.5 font-semibold text-sm transition-opacity duration-150 ${
                      day === activeDay ? "flex" : "hidden"
                    } lg:flex items-center justify-between gap-2 ${
                      draggingDay && day === draggingDay
                        ? "bg-[var(--color-day-drag-bg)] text-accent/80 ring-1 ring-inset ring-accent/40"
                        : draggingDay
                        ? "bg-[var(--color-bg-surface)] opacity-30"
                        : pubHoliday
                        ? "bg-[var(--color-bg-surface)] opacity-50"
                        : "bg-[var(--color-bg-surface)]"
                    }`}
                  >
                    {/* Left: day label + optional holiday badge */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1">
                      <span className="whitespace-nowrap">{dayLabel(day)}</span>
                      {holidayType && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          pubHoliday
                            ? "bg-red-500/15 text-red-600 dark:text-red-400"
                            : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                        }`}>
                          {pubHoliday ? t("publicHoliday") : t("companyHoliday")}
                        </span>
                      )}
                    </div>
                    {/* Right: action buttons */}
                    {!draggingDay && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!pubHoliday && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCopyPopoverDay(copyPopoverDay === day ? null : day);
                            }}
                            title={t("copyAssignmentsTo", { day: dayLabel(day) })}
                            className="flex items-center rounded bg-[var(--color-copy-btn)] p-1.5 text-[var(--color-copy-btn-text)] transition-colors hover:bg-[var(--color-copy-btn-hover)] hover:text-[var(--color-text-primary)]"
                          >
                            <CopyIcon size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHolidayPopoverDay(holidayPopoverDay === day ? null : day);
                          }}
                          title={t("holidaySettings")}
                          className={`flex items-center rounded p-1.5 transition-colors ${
                            holidayType
                              ? "text-amber-500 hover:bg-amber-500/10"
                              : "bg-[var(--color-copy-btn)] text-[var(--color-copy-btn-text)] hover:bg-[var(--color-copy-btn-hover)] hover:text-[var(--color-text-primary)]"
                          }`}
                        >
                          <GearIcon size={14} />
                        </button>
                      </div>
                    )}
                    {copyPopoverDay === day && (
                      <div className="absolute top-full left-0 z-50 mt-1 min-w-[140px] rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] p-2 shadow-xl">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                          {t("copyFrom")}
                        </div>
                        {DAYS.filter((d) => d !== day).map((sourceDay) => (
                          <button
                            key={sourceDay}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              requestCopyDay(sourceDay, day);
                            }}
                            className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                          >
                            {dayLabel(sourceDay)}
                          </button>
                        ))}
                      </div>
                    )}
                    {holidayPopoverDay === day && (
                      <div className="absolute top-full right-0 z-50 mt-1 min-w-[200px] rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] p-2 shadow-xl">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                          {t("holidaySettings")}
                        </div>
                        {!holidayType ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setHolidayPopoverDay(null); applyHoliday(day, "public_holiday"); }}
                              className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                            >
                              {t("setPublicHoliday")}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setHolidayPopoverDay(null); applyHoliday(day, "company_holiday"); }}
                              className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                            >
                              {t("setCompanyHoliday")}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setHolidayPopoverDay(null); removeHoliday(day); }}
                            className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
                          >
                            {t("clearHoliday")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Project swimlanes — active / planned */}
            {visibleProjects
              .filter((p) => {
                const s = effectiveStatus(p);
                return s !== "done" && s !== "inactive" && s !== "on_hold";
              })
              .map((project) => {
                const isCollapsed = (collapsedRows ?? new Set()).has(project.id);
                const es = effectiveStatus(project);
                const isPlanned = es === "planned";
                return (
                  <div key={project.id} className={`flex flex-col gap-2 ${isPlanned ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-2 py-1">
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(project.id)}
                        title={isCollapsed ? t("expand") : t("collapse")}
                        className="flex-shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        <svg
                          className={`h-3 w-3 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(project.id)}
                        className="flex min-w-0 items-center gap-1 text-left text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        <span className="truncate">{project.name}</span>
                        {project.constructionManagerName && (
                          <span className="flex flex-shrink-0 items-center gap-1 text-[11px] font-normal text-[var(--color-text-muted)]">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="8" r="4" />
                              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                            </svg>
                            {project.constructionManagerName}
                          </span>
                        )}
                      </button>
                      <StatusChip
                        project={project}
                        status={es}
                        isOpen={statusPopoverProjectId === project.id}
                        onToggle={() => setStatusPopoverProjectId(statusPopoverProjectId === project.id ? null : project.id)}
                        applying={applyingStatusChange}
                        onTransition={handleStatusTransition}
                      />
                    </div>
                    {!isCollapsed && (
                      <div className="flex gap-4 items-stretch">
                        {DAYS.map((day) => renderCell(project.id, day))}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* On-hold swimlanes — always collapsed, no assignments, rendered before sick/vacation */}
            {visibleProjects
              .filter((p) => effectiveStatus(p) === "on_hold")
              .map((project) => {
                const es = effectiveStatus(project);
                return (
                  <div key={project.id} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 py-1">
                      <span className="flex-shrink-0 text-[var(--color-text-muted)]">
                        <svg className="h-3 w-3 -rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                      <span className="flex min-w-0 items-center gap-1 text-left text-sm font-semibold text-[var(--color-text-primary)]">
                        <span className="truncate">{project.name}</span>
                        {project.constructionManagerName && (
                          <span className="flex flex-shrink-0 items-center gap-1 text-[11px] font-normal text-[var(--color-text-muted)]">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="8" r="4" />
                              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                            </svg>
                            {project.constructionManagerName}
                          </span>
                        )}
                      </span>
                      <StatusChip
                        project={project}
                        status={es}
                        isOpen={statusPopoverProjectId === project.id}
                        onToggle={() => setStatusPopoverProjectId(statusPopoverProjectId === project.id ? null : project.id)}
                        applying={applyingStatusChange}
                        onTransition={handleStatusTransition}
                      />
                    </div>
                  </div>
                );
              })}

            {/* Sick & Vacation swimlane */}
            <div className="flex flex-col gap-2 mt-4 pb-4">
              <button
                type="button"
                onClick={() => toggleCollapsed("sick-vacation")}
                className="flex items-center gap-2 py-1 text-left text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
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
                {t("sickVacation")}
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
                        className={`w-full lg:min-w-max lg:flex-1 min-h-[60px] rounded-md p-2.5 flex-col gap-2 border border-dashed border-[var(--color-avail-border)] transition-opacity duration-150 ${
                          day === activeDay ? "flex" : "hidden"
                        } lg:flex ${isPublicHoliday(day) ? "opacity-50" : ""}`}
                      >
                        {entries.map(({ employee, status }) => (
                          <button
                            key={employee.id}
                            type="button"
                            onClick={() => clearAvailability(employee.id, day)}
                            title={t("clickToRemoveStatus")}
                            className="flex w-full min-w-max cursor-pointer items-center gap-2 rounded-full border border-[var(--color-avail-border)] bg-[var(--color-avail-bg)] p-1.5 text-sm transition-colors hover:border-[var(--color-avail-hover)]"
                          >
                            <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-[var(--color-avatar-bg)]">
                              {employee.img && (
                                <img
                                  src={employee.img}
                                  alt={employee.name}
                                  className="h-full w-full object-cover"
                                />
                              )}
                            </div>
                            <span className="whitespace-nowrap text-xs font-medium text-[var(--color-text-primary)]">
                              {employee.name}
                            </span>
                            <span className="ml-auto pl-1 text-[var(--color-text-secondary)]">
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
                      className="hidden lg:flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] shadow-md transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]"
                      title={t("copyAssignmentsFrom", { week: previousWeek.label })}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      {t("copyPrevWeek")}
                    </button>
                  )}

                  {/* Filter button */}
                  <button
                    type="button"
                    onClick={() => { setSideMenuOpen(false); setFilterModalOpen(true); }}
                    className={`flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium shadow-md transition-colors ${
                      filterManagerId
                        ? "bg-accent text-white"
                        : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    <FilterIcon size={14} />
                    {activeManagerName ?? t("filter")}
                  </button>

                  {/* Reset — only when a filter is active */}
                  {filterManagerId && (
                    <button
                      type="button"
                      onClick={() => setFilterManagerId(null)}
                      title={t("clearFilter")}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] shadow-md transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                title={sideMenuOpen ? t("closeMenu") : t("openMenu")}
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg shadow-md transition-colors ${
                  filterManagerId
                    ? "bg-accent text-white"
                    : "bg-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-muted)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d={sideMenuOpen ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
                </svg>
              </button>

            </div>
          </div>

          {/* Pool resize handle */}
          <div
            className="flex h-5 shrink-0 cursor-ns-resize touch-none items-center justify-center gap-1 border-t-2 border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] transition-colors hover:bg-[var(--color-bg-hover)] group select-none"
            onPointerDown={handlePoolResizeStart}
          >
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-1 w-1 rounded-full bg-[var(--color-text-muted)] transition-colors group-hover:bg-accent" />
            ))}
          </div>

          {/* Pool — always visible at the bottom of the content column, scrolls independently */}
          <div
            ref={poolOverlayRef}
            className="pool-overlay flex flex-col gap-2 bg-[var(--color-bg-page)] px-4 pt-3 pb-4"
          >
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
            {t("pool")}
          </button>
          {!(collapsedRows ?? new Set()).has("pool") && <div className="flex gap-4 items-stretch">
            {DAYS.map((day) => {
              const fdId = poolFullDayId(day);
              const isDimmed = Boolean(draggingDay && day !== draggingDay);
              const isDraggingFullHere = draggingDay === day && draggingDayPart === "full_day";
              const pubHoliday = isPublicHoliday(day);

              return (
                <div
                  key={day}
                  className={`w-full lg:min-w-max lg:flex-1 flex flex-col rounded-md border border-dashed transition-opacity duration-150 ${
                    day === activeDay ? "" : "hidden"
                  } lg:block ${
                    isDimmed ? "opacity-30 border-[var(--color-border-subtle)]"
                    : pubHoliday ? "opacity-50 border-[var(--color-border-subtle)]"
                    : "border-[var(--color-border-strong)]"
                  }`}
                >
                  <Droppable droppableId={fdId} type={day} isDropDisabled={pubHoliday}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 min-h-[56px] p-2.5 flex flex-col gap-2.5 transition-colors ${
                          snapshot.isDraggingOver
                            ? "bg-[var(--color-bg-hover)]"
                            : isDraggingFullHere
                              ? "bg-[var(--color-nav-active-bg)]"
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
                            isDragDisabled={pubHoliday}
                            isOpen={openCardId === getDraggableId(entry.employee.id, day, "full_day")}
                            onToggle={() => toggleOpenCard(getDraggableId(entry.employee.id, day, "full_day"))}
                            onMarkSick={() => { if (!pubHoliday) markAvailability(entry.employee.id, day, "sick"); }}
                            onMarkVacation={() => { if (!pubHoliday) markAvailability(entry.employee.id, day, "vacation"); }}
                            onAssignToSite={pubHoliday ? undefined : (anchor) => {
                              setOpenCardId(null);
                              setSitePickerFor({ employeeId: entry.employee.id, day, sourceCellId: fdId, ...anchor });
                            }}
                            commentCount={commentCounts[commentKey(entry.employee.id, day)] ?? 0}
                            onOpenComments={() => { setOpenCardId(null); setCommentsFor({ employeeId: entry.employee.id, day }); }}
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

    {/* Sync status badge — shows unsent edits so they're never silently lost */}
    {(syncPending > 0 || justSaved) && (
      <div
        className={`fixed bottom-4 right-4 z-[95] flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold shadow-xl transition-colors ${
          syncPending === 0
            ? "bg-[var(--color-bg-overlay)] text-[var(--color-text-secondary)]"
            : syncStatus === "retrying"
              ? "bg-red-600 text-white"
              : "bg-[var(--color-bg-overlay)] text-[var(--color-text-secondary)]"
        }`}
      >
        {syncPending === 0
          ? t("syncSaved")
          : syncStatus === "retrying"
            ? t("syncRetrying", { count: syncPending, attempt: syncAttempt })
            : t("syncSaving", { count: syncPending })}
      </div>
    )}

    {/* Site picker — fixed overlay, pops up above the "assign to site" button */}
    <SitePickerPopover
      sitePickerFor={sitePickerFor}
      projects={dbProjects.filter((p) => effectiveStatus(p) !== "on_hold")}
      onAssign={assignToSite}
    />

    {/* Comments dialog */}
    <CommentsDialog
      commentsFor={commentsFor}
      employeeName={dbEmployees.find((e) => e.id === commentsFor?.employeeId)?.name ?? ""}
      commentsList={commentsList}
      commentDraft={commentDraft}
      onDraftChange={setCommentDraft}
      commentSaving={commentSaving}
      commentError={commentError}
      locale={locale}
      onClose={closeComments}
      onSubmit={submitComment}
      onRemove={removeComment}
    />

    {/* Copy previous week confirmation modal */}
    <CopyWeekModal
      open={copyWeekModalOpen}
      previousWeek={previousWeek}
      selectedWeekLabel={selectedWeek.label}
      targetWeekHasAssignments={targetWeekHasAssignments}
      onClose={() => setCopyWeekModalOpen(false)}
      onConfirm={() => void copyPreviousWeek()}
    />

    {/* Day-copy overwrite confirmation — only shown when the target day already has assignments */}
    <DayCopyConfirmModal
      confirm={dayCopyConfirm}
      dayLabel={dayLabel}
      onCancel={() => setDayCopyConfirm(null)}
      onConfirm={(sourceDay, targetDay) => {
        copyDay(sourceDay, targetDay);
        setDayCopyConfirm(null);
      }}
    />

    {/* Filter modal */}
    <FilterModal
      open={filterModalOpen}
      managersWithSites={managersWithSites}
      pendingManagerId={pendingManagerId}
      onSelectManager={setPendingManagerId}
      onApply={() => { setFilterManagerId(pendingManagerId); setFilterModalOpen(false); }}
      onClose={() => setFilterModalOpen(false)}
    />

    {/* On-hold confirmation modal — warns that assignments will be removed */}
    <HoldConfirmModal
      transition={holdingTransition}
      projectName={dbProjects.find((p) => p.id === holdingTransition?.projectId)?.name}
      applying={applyingStatusChange}
      onCancel={() => setHoldingTransition(null)}
      onConfirm={() => void handleConfirmHold()}
    />

    {/* Complete site confirmation modal */}
    <CompleteConfirmModal
      transition={completingTransition}
      projectName={dbProjects.find((p) => p.id === completingTransition?.projectId)?.name}
      applying={applyingStatusChange}
      onCancel={() => setCompletingTransition(null)}
      onConfirm={() => void handleConfirmComplete()}
    />

    <PastWeekModal
      open={showPastWeekModal}
      onConfirm={() => executePending(false)}
      onMute={() => executePending(true)}
      onCancel={() => { setShowPastWeekModal(false); setPendingAction(null); }}
    />

  </DragDropContext>
  );
}
