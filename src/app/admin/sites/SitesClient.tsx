"use client";

import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "~/components/Sidebar";
import type { ProjectStatus } from "~/types";
import { getSuperStatus, ALLOWED_TRANSITIONS } from "~/types";
import { createSite, updateSite, deleteSite, getSiteTransitions, setSiteTransition, deleteSiteTransition } from "~/server/actions/sites";
import { addUtcDays, normalizeWeekStart, toDateParam, formatWeekLabel } from "~/lib/week";

// ── Types ─────────────────────────────────────────────────────────────────────

type Manager = { id: string; name: string };

type SiteSortKey = "name" | "status" | "startDate" | "endDate" | "manager" | "description";
type SiteSortDir = "asc" | "desc" | null;

function SortIcon({ dir }: { dir: SiteSortDir }) {
  if (dir === "asc") return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block ml-1 flex-shrink-0">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
  if (dir === "desc") return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block ml-1 flex-shrink-0">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block ml-1 flex-shrink-0 opacity-30">
      <polyline points="18 15 12 9 6 15" /><polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

type Site = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: ProjectStatus;
  constructionManagerId: string | null;
  constructionManagerName: string | null;
};

type FormState = {
  id?: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  constructionManagerId: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  constructionManagerId: "",
};

// ── Status meta ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planned:  "Planned",
  active:   "Active",
  on_hold:  "On hold",
  done:     "Done",
  inactive: "Inactive",
};

const STATUS_BADGE: Record<ProjectStatus, string> = {
  planned:  "bg-[#1a2535] text-[#60a5fa] border border-[#1e3145]",
  active:   "bg-[#0f2e1e] text-[#4ade80] border border-[#1a4a2e]",
  on_hold:  "bg-[#2c2619] text-[#fbbf24] border border-[#3d3319]",
  done:     "bg-[#0f2020] text-[#34d399] border border-[#1a3530]",
  inactive: "bg-[#252429] text-[#6b6875] border border-[#313036]",
};

const STATUS_CHIP_BG: Record<ProjectStatus, string> = {
  planned:  "bg-[#1a2535]",
  active:   "bg-[#0f2e1e]",
  on_hold:  "bg-[#2c2619]",
  done:     "bg-[#0f2020]",
  inactive: "bg-[#252429]",
};

const STATUS_CHIP_TEXT: Record<ProjectStatus, string> = {
  planned:  "text-[#60a5fa]",
  active:   "text-[#4ade80]",
  on_hold:  "text-[#fbbf24]",
  done:     "text-[#34d399]",
  inactive: "text-[#6b6875]",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const toInputDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

const formatDate = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const LOAD_STEP = 4;
const INIT_RANGE = 4;

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Site form panel ───────────────────────────────────────────────────────────

function SiteFormPanel({
  form, managers, saving, onClose, onChange, onSave,
}: {
  form: FormState; managers: Manager[]; saving: boolean;
  onClose: () => void; onChange: (f: FormState) => void; onSave: () => void;
}) {
  const isEdit = Boolean(form.id);

  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">{label}</label>
      {node}
    </div>
  );

  const inputCls =
    "w-full rounded-lg border border-[#313036] bg-[#17161c] px-3 py-2 text-sm text-[#ececef] placeholder-[#4a4950] outline-none focus:border-[var(--color-accent)] transition-colors";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-[#313036] bg-[#1f1e24] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#313036] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#ececef]">
            {isEdit ? "Edit building site" : "New building site"}
          </h2>
          <button type="button" onClick={onClose} title="Close"
            className="rounded-md p-1 text-[#6b6875] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
            <CloseIcon />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-6">
          {field("Name *",
            <input type="text" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })}
              placeholder="e.g. Site Müller – Hauptstraße" className={inputCls} autoFocus />,
          )}
          {field("Description",
            <textarea value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })}
              placeholder="Optional notes about this site" rows={3} className={`${inputCls} resize-none`} />,
          )}
          {field("Construction manager",
            <select value={form.constructionManagerId} title="Construction manager"
              onChange={(e) => onChange({ ...form, constructionManagerId: e.target.value })}
              className={inputCls}>
              <option value="">— None —</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>,
          )}
          <div className="grid grid-cols-2 gap-3">
            {field("Start date",
              <input type="date" value={form.startDate} title="Start date"
                onChange={(e) => onChange({ ...form, startDate: e.target.value })} className={inputCls} />,
            )}
            {field("End date",
              <input type="date" value={form.endDate} title="End date"
                onChange={(e) => onChange({ ...form, endDate: e.target.value })} className={inputCls} />,
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#313036] px-5 py-4">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[#a09fa6] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={!form.name.trim() || saving}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90">
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create site"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Delete confirm panel ──────────────────────────────────────────────────────

function DeleteConfirmPanel({
  site, deleting, onClose, onConfirm,
}: {
  site: Site; deleting: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#313036] bg-[#1f1e24] p-6 shadow-2xl">
        <h2 className="mb-2 text-sm font-semibold text-[#ececef]">Delete building site?</h2>
        <p className="mb-5 text-xs text-[#a09fa6]">
          <span className="font-medium text-[#ececef]">{site.name}</span> will be permanently
          deleted. Existing assignments referencing this site will be unlinked.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[#a09fa6] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={deleting}
            className="rounded-lg bg-[#5c1e1e] px-4 py-2 text-sm font-medium text-[#f87171] transition-opacity disabled:opacity-40 hover:bg-[#6e2424]">
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Status transition panel ───────────────────────────────────────────────────

type TransitionEntry = { weekStartIso: string; status: ProjectStatus };

type DropdownPos = { top: number; left: number; width: number; maxH: number };

function computeEffectiveToday(rows: TransitionEntry[]): ProjectStatus {
  const todayIso = toDateParam(normalizeWeekStart(new Date()));
  const applicable = rows.filter((t) => t.weekStartIso <= todayIso);
  return applicable.length > 0 ? applicable[applicable.length - 1]!.status : "planned";
}

function SiteStatusPanel({
  site,
  onClose,
  onStatusChange,
}: {
  site: Site;
  onClose: () => void;
  onStatusChange: (id: string, status: ProjectStatus) => void;
}) {
  const [transitions, setTransitions] = useState<TransitionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [pickedStatus, setPickedStatus] = useState<ProjectStatus | null>(null);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null);
  const [applying, setApplying] = useState(false);
  const [deletingWeek, setDeletingWeek] = useState<string | null>(null);
  const [warnOngoing, setWarnOngoing] = useState(false);
  const [warnOngoingAfter, setWarnOngoingAfter] = useState(false);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  const [weeksBefore, setWeeksBefore] = useState(INIT_RANGE);
  const [weeksAfter, setWeeksAfter] = useState(INIT_RANGE);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentWeekIso = toDateParam(normalizeWeekStart(new Date()));

  const weeks = useMemo(() => {
    const currentStart = normalizeWeekStart(new Date());
    return Array.from({ length: weeksBefore + 1 + weeksAfter }, (_, i) =>
      toDateParam(addUtcDays(currentStart, (i - weeksBefore) * 7)),
    );
  }, [weeksBefore, weeksAfter]);

  useEffect(() => {
    getSiteTransitions(site.id)
      .then(setTransitions)
      .finally(() => setLoading(false));
  }, [site.id]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!weekPickerOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        (!triggerRef.current || !triggerRef.current.contains(t)) &&
        (!dropdownRef.current || !dropdownRef.current.contains(t))
      ) {
        setWeekPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [weekPickerOpen]);

  const effectiveStatusAt = (weekIso: string): ProjectStatus => {
    const applicable = transitions.filter((t) => t.weekStartIso <= weekIso);
    return applicable.length > 0 ? applicable[applicable.length - 1]!.status : "planned";
  };

  const currentEffective = selectedWeek ? effectiveStatusAt(selectedWeek) : null;
  const allowed = currentEffective ? ALLOWED_TRANSITIONS[currentEffective] : [];
  const isCompletedToOngoing =
    currentEffective != null &&
    pickedStatus != null &&
    getSuperStatus(currentEffective) === "completed" &&
    getSuperStatus(pickedStatus) === "ongoing";

  // Set dropdown position imperatively to avoid inline style prop lint warning
  useLayoutEffect(() => {
    if (!dropdownRef.current || !dropdownPos) return;
    const el = dropdownRef.current;
    el.style.top = `${dropdownPos.top}px`;
    el.style.left = `${dropdownPos.left}px`;
    el.style.width = `${dropdownPos.width}px`;
    el.style.maxHeight = `${dropdownPos.maxH}px`;
  }, [dropdownPos, weekPickerOpen]);

  const openPicker = () => {
    if (weekPickerOpen) {
      setWeekPickerOpen(false);
      return;
    }
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const maxH = Math.min(480, window.innerHeight - r.bottom - 16);
      setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width, maxH });
    }
    setWeekPickerOpen(true);
  };

  const laterOngoingAffected = useMemo(() => {
    if (!selectedWeek || !pickedStatus) return 0;
    if (getSuperStatus(pickedStatus) !== "completed") return 0;
    return transitions.filter(
      (t) => t.weekStartIso > selectedWeek && getSuperStatus(t.status) === "ongoing",
    ).length;
  }, [selectedWeek, pickedStatus, transitions]);

  const handleWeekSelect = (weekIso: string) => {
    setSelectedWeek(weekIso);
    setPickedStatus(null);
    setWeekPickerOpen(false);
    setWarnOngoing(false);
    setWarnOngoingAfter(false);
    setBlockMsg(null);
  };

  const handleApply = async (force = false) => {
    if (!selectedWeek || !pickedStatus) return;
    setApplying(true);
    setBlockMsg(null);
    try {
      const result = await setSiteTransition(site.id, selectedWeek, pickedStatus, force);
      if ("blocked" in result) {
        setBlockMsg(`"${STATUS_LABELS[pickedStatus]}" is not a valid transition from the current status.`);
        setWarnOngoing(false);
        setWarnOngoingAfter(false);
      } else if ("warn" in result) {
        if (result.warn === "ongoing_after_completed") {
          setWarnOngoingAfter(true);
        } else {
          setWarnOngoing(true);
        }
      } else {
        const rows = await getSiteTransitions(site.id);
        setTransitions(rows);
        onStatusChange(site.id, computeEffectiveToday(rows));
        setSelectedWeek(null);
        setPickedStatus(null);
        setWarnOngoing(false);
        setWarnOngoingAfter(false);
      }
    } finally {
      setApplying(false);
    }
  };

  const handleDelete = async (weekIso: string) => {
    setDeletingWeek(weekIso);
    try {
      await deleteSiteTransition(site.id, weekIso);
      const rows = await getSiteTransitions(site.id);
      setTransitions(rows);
      onStatusChange(site.id, computeEffectiveToday(rows));
      if (selectedWeek === weekIso) {
        setSelectedWeek(null);
        setPickedStatus(null);
      }
    } finally {
      setDeletingWeek(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,520px)] max-h-[min(90vh,640px)] flex flex-col rounded-2xl border border-[#313036] bg-[#1f1e24] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#313036] px-5 py-4 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[#ececef]">Status transitions</h2>
            <p className="text-xs text-[#6b6875] mt-0.5">{site.name}</p>
          </div>
          <button type="button" onClick={onClose} title="Close"
            className="rounded-md p-1 text-[#6b6875] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5 min-h-0">

          {/* Existing transitions */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6875] mb-2">
              Recorded transitions
            </p>
            {loading ? (
              <p className="text-sm text-[#6b6875]">Loading…</p>
            ) : transitions.length === 0 ? (
              <p className="text-xs text-[#4a4950]">
                No transitions set — defaults to <span className={`font-semibold ${STATUS_CHIP_TEXT.planned}`}>Planned</span>
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {transitions.map((t) => (
                  <div key={t.weekStartIso}
                    className="flex items-center gap-3 rounded-lg bg-[#28272d] px-3 py-2">
                    <span className="flex-1 text-xs text-[#a09fa6]">
                      From {formatWeekLabel(t.weekStartIso)}
                    </span>
                    <StatusBadge status={t.status} />
                    <button
                      type="button"
                      title="Remove transition"
                      disabled={deletingWeek === t.weekStartIso}
                      onClick={() => void handleDelete(t.weekStartIso)}
                      className="rounded p-1 text-[#6b6875] transition-colors hover:text-[#f87171] disabled:opacity-40"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[#313036]" />

          {/* Set transition */}
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
              Set transition
            </p>

            {/* Week picker trigger */}
            <button
              ref={triggerRef}
              type="button"
              onClick={openPicker}
              className="w-full flex items-center justify-between rounded-lg border border-[#313036] bg-[#17161c] px-3 py-2 text-sm text-left transition-colors hover:border-[var(--color-accent)] focus:outline-none focus:border-[var(--color-accent)]"
            >
              <span className={selectedWeek ? "text-[#ececef]" : "text-[#4a4950]"}>
                {selectedWeek ? formatWeekLabel(selectedWeek) : "Select a week…"}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`text-[#6b6875] transition-transform ${weekPickerOpen ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Available transitions */}
            {currentEffective && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-[#6b6875]">
                  Effective status: <StatusBadge status={currentEffective} />
                  <span className="ml-1.5">→ transition to:</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allowed.map((s) => {
                    const wouldAffectLater =
                      getSuperStatus(s) === "completed" &&
                      transitions.some(
                        (t) => selectedWeek && t.weekStartIso > selectedWeek && getSuperStatus(t.status) === "ongoing",
                      );
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setPickedStatus(s); setWarnOngoing(false); setWarnOngoingAfter(false); setBlockMsg(null); }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                          pickedStatus === s
                            ? `${STATUS_CHIP_BG[s]} ${STATUS_CHIP_TEXT[s]} ring-1 ring-white/30`
                            : "bg-[#28272d] text-[#6b6875] hover:text-[#a09fa6]"
                        }`}
                      >
                        {STATUS_LABELS[s]}
                        {(getSuperStatus(currentEffective!) === "completed" && getSuperStatus(s) === "ongoing") || wouldAffectLater ? (
                          <span className="ml-1 text-[#fbbf24]">⚠</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Block message */}
            {blockMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-[#4a1e1e] bg-[#2c1212] px-3 py-2 text-xs text-[#f87171]">
                <svg className="mt-0.5 flex-shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {blockMsg}
              </div>
            )}

            {/* Warning: completed → ongoing */}
            {warnOngoing && isCompletedToOngoing && (
              <div className="flex items-start gap-3 rounded-lg border border-[#4a3b1a] bg-[#2c2210] px-3 py-3">
                <svg className="mt-0.5 flex-shrink-0 text-[#fbbf24]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[#fbbf24]">Reverting a completed site to ongoing</p>
                  <p className="mt-1 text-[11px] text-[#a09fa6]">
                    All transitions currently marked <strong>Done</strong> or <strong>Inactive</strong> will be reset to <strong>On hold</strong>.
                    This cannot be undone automatically.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button type="button" onClick={() => void handleApply(true)} disabled={applying}
                    className="rounded-lg bg-[#fbbf24] px-3 py-1.5 text-xs font-semibold text-[#1a1500] transition-opacity hover:opacity-90 disabled:opacity-50">
                    {applying ? "Applying…" : "Apply anyway"}
                  </button>
                  <button type="button" onClick={() => setWarnOngoing(false)}
                    className="rounded-lg px-3 py-1.5 text-xs text-[#6b6875] hover:text-[#a09fa6] text-center">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Warning: ongoing_after_completed */}
            {warnOngoingAfter && pickedStatus && (
              <div className="flex items-start gap-3 rounded-lg border border-[#4a3b1a] bg-[#2c2210] px-3 py-3">
                <svg className="mt-0.5 flex-shrink-0 text-[#fbbf24]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[#fbbf24]">
                    Later ongoing transitions will be removed
                  </p>
                  <p className="mt-1 text-[11px] text-[#a09fa6]">
                    {laterOngoingAffected} transition{laterOngoingAffected !== 1 ? "s" : ""} after this week{" "}
                    {laterOngoingAffected !== 1 ? "are" : "is"} <strong>Active</strong> or <strong>On hold</strong> and would
                    contradict the <strong>{STATUS_LABELS[pickedStatus]}</strong> state set here. They will be permanently deleted.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button type="button" onClick={() => void handleApply(true)} disabled={applying}
                    className="rounded-lg bg-[#fbbf24] px-3 py-1.5 text-xs font-semibold text-[#1a1500] transition-opacity hover:opacity-90 disabled:opacity-50">
                    {applying ? "Applying…" : "Apply anyway"}
                  </button>
                  <button type="button" onClick={() => setWarnOngoingAfter(false)}
                    className="rounded-lg px-3 py-1.5 text-xs text-[#6b6875] hover:text-[#a09fa6] text-center">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {!warnOngoing && !warnOngoingAfter && (
          <div className="border-t border-[#313036] px-5 py-4 flex-shrink-0 flex items-center justify-between">
            <p className="text-[11px] text-[#4a4950]">
              {transitions.length === 0
                ? "No transitions — project is Planned by default"
                : `${transitions.length} transition${transitions.length !== 1 ? "s" : ""} recorded`}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="rounded-lg px-4 py-2 text-xs text-[#a09fa6] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
                Close
              </button>
              <button
                type="button"
                onClick={() => void handleApply(false)}
                disabled={!selectedWeek || !pickedStatus || applying}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-40 hover:opacity-90"
              >
                {applying ? "Applying…" : "Apply transition"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Week picker dropdown — fixed overlay, outside modal stacking context */}
      {weekPickerOpen && dropdownPos && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] flex flex-col rounded-lg border border-[#313036] bg-[#1f1e24] shadow-2xl overflow-hidden"
        >
          {/* Load more above */}
          <button
            type="button"
            onClick={() => setWeeksBefore((n) => n + LOAD_STEP)}
            className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-[#6b6875] hover:text-[#a09fa6] hover:bg-[#28272d] transition-colors flex-shrink-0 border-b border-[#252429]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            Load {LOAD_STEP} more weeks
          </button>

          {/* Week list */}
          <div className="overflow-y-auto flex-1">
            {weeks.map((weekIso) => {
              const eff = effectiveStatusAt(weekIso);
              const isCurrent = weekIso === currentWeekIso;
              const hasTransition = transitions.some((t) => t.weekStartIso === weekIso);
              const isSelected = selectedWeek === weekIso;
              return (
                <button
                  key={weekIso}
                  type="button"
                  onClick={() => handleWeekSelect(weekIso)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-left transition-colors hover:bg-[#28272d] ${isSelected ? "bg-[#28272d]" : ""}`}
                >
                  <span className={`flex-1 ${isCurrent ? "font-semibold text-[#ececef]" : "text-[#a09fa6]"}`}>
                    {formatWeekLabel(weekIso)}
                    {isCurrent && <span className="ml-1.5 text-[#4a4950]">(current)</span>}
                  </span>
                  {hasTransition && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] flex-shrink-0" />
                  )}
                  <StatusBadge status={eff} />
                </button>
              );
            })}
          </div>

          {/* Load more below */}
          <button
            type="button"
            onClick={() => setWeeksAfter((n) => n + LOAD_STEP)}
            className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-[#6b6875] hover:text-[#a09fa6] hover:bg-[#28272d] transition-colors flex-shrink-0 border-t border-[#252429]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Load {LOAD_STEP} more weeks
          </button>
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SitesClient({ sites: initialSites, managers }: { sites: Site[]; managers: Manager[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [navSidebarOpen, setNavSidebarOpen] = useState(false);
  const [sites, setSites] = useState(initialSites);

  const [sortKey, setSortKey] = useState<SiteSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SiteSortDir>(null);

  const handleSort = (key: SiteSortKey) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir(null); }
  };

  const sortedSites = useMemo(() => {
    if (!sortKey || !sortDir) return sites;
    return [...sites].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "startDate" || sortKey === "endDate") {
        va = a[sortKey] ? a[sortKey]!.getTime() : sortDir === "asc" ? Infinity : -Infinity;
        vb = b[sortKey] ? b[sortKey]!.getTime() : sortDir === "asc" ? Infinity : -Infinity;
        return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
      }
      va = (sortKey === "manager" ? (a.constructionManagerName ?? "") : (a[sortKey as keyof Site] as string | null) ?? "").toLowerCase();
      vb = (sortKey === "manager" ? (b.constructionManagerName ?? "") : (b[sortKey as keyof Site] as string | null) ?? "").toLowerCase();
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [sites, sortKey, sortDir]);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusSite, setStatusSite] = useState<Site | null>(null);

  useEffect(() => { setSites(initialSites); }, [initialSites]);

  const openAdd = () => { setForm(EMPTY_FORM); setFormOpen(true); };

  const openEdit = (site: Site) => {
    setForm({
      id: site.id,
      name: site.name,
      description: site.description ?? "",
      startDate: toInputDate(site.startDate),
      endDate: toInputDate(site.endDate),
      constructionManagerId: site.constructionManagerId ?? "",
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (form.id) {
        await updateSite({
          id: form.id,
          name: form.name,
          description: form.description || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          constructionManagerId: form.constructionManagerId || null,
        });
      } else {
        await createSite({
          name: form.name,
          description: form.description || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          constructionManagerId: form.constructionManagerId || null,
        });
      }
      setFormOpen(false);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSite(deleteTarget.id);
      setDeleteTarget(null);
      startTransition(() => router.refresh());
    } finally {
      setDeleting(false);
    }
  };

  const handleSiteStatusChange = (id: string, status: ProjectStatus) => {
    setSites((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  void isPending;

  return (
    <div className="flex h-dvh bg-[#17161c] text-[#ececef]">
      <Sidebar mobileOpen={navSidebarOpen} onMobileClose={() => setNavSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-h-0 min-w-0 lg:pl-14">

      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center gap-4 border-b border-[#313036] bg-[#1f1e24] px-6 py-4">
        <button
          type="button"
          onClick={() => setNavSidebarOpen(true)}
          title="Open menu"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[#a09fa6] transition-colors hover:bg-[#313036] hover:text-[#ececef] lg:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className="text-sm font-semibold text-[#ececef]">Building Sites</h1>
        <button type="button" onClick={openAdd}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add site
        </button>
      </header>

      {/* Table */}
      <main className="flex-1 overflow-y-auto overflow-x-clip p-6">
        {sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#313036] py-20 text-center">
            <p className="text-sm text-[#6b6875]">No building sites yet</p>
            <button type="button" onClick={openAdd}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90">
              Add your first site
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#313036]">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#313036] bg-[#1f1e24]">
                  {([ ["name","Name"], ["status","Status"], ["startDate","Start date"], ["endDate","End date"], ["manager","Manager"], ["description","Description"] ] as [SiteSortKey, string][]).map(([key, label]) => (
                    <th key={key} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
                      <button type="button" onClick={() => handleSort(key)} className="flex items-center gap-0.5 transition-colors hover:text-[#ececef]">
                        {label}<SortIcon dir={sortKey === key ? sortDir : null} />
                      </button>
                    </th>
                  ))}
                  <th className="w-24 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedSites.map((site, i) => (
                  <tr key={site.id}
                    className={`border-b border-[#252429] transition-colors hover:bg-[#252429] ${i === sortedSites.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-4 py-3 font-medium text-[#ececef]">{site.name}</td>
                    <td className="px-4 py-3"><StatusBadge status={site.status} /></td>
                    <td className="px-4 py-3 text-[#a09fa6]">{formatDate(site.startDate)}</td>
                    <td className="px-4 py-3 text-[#a09fa6]">{formatDate(site.endDate)}</td>
                    <td className="px-4 py-3 text-[#a09fa6]">
                      {site.constructionManagerName ?? <span className="text-[#4a4950]">—</span>}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-[#a09fa6]">
                      <span className="line-clamp-1">{site.description ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setStatusSite(site)} title="Status transitions"
                          className="rounded-md p-1.5 text-[#6b6875] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </button>
                        <button type="button" onClick={() => openEdit(site)} title="Edit"
                          className="rounded-md p-1.5 text-[#6b6875] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(site)} title="Delete"
                          className="rounded-md p-1.5 text-[#6b6875] transition-colors hover:bg-[#3a1e1e] hover:text-[#f87171]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" /><path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Overlays */}
      {formOpen && (
        <SiteFormPanel form={form} managers={managers} saving={saving}
          onClose={() => setFormOpen(false)} onChange={setForm} onSave={() => void handleSave()} />
      )}
      {deleteTarget && (
        <DeleteConfirmPanel site={deleteTarget} deleting={deleting}
          onClose={() => setDeleteTarget(null)} onConfirm={() => void handleDelete()} />
      )}
      {statusSite && (
        <SiteStatusPanel
          site={statusSite}
          onClose={() => setStatusSite(null)}
          onStatusChange={handleSiteStatusChange}
        />
      )}
      </div>
    </div>
  );
}
