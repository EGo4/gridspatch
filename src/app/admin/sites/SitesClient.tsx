"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "~/types";
import { getSuperStatus } from "~/types";
import { createSite, updateSite, deleteSite, getSiteWeekStatuses, setSiteWeekStatuses } from "~/server/actions/sites";
import { addUtcDays, normalizeWeekStart, toDateParam, formatWeekLabel } from "~/lib/week";

// ── Types ─────────────────────────────────────────────────────────────────────

type Manager = { id: string; name: string };

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
  status: ProjectStatus;
  constructionManagerId: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  status: "planned",
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

// Colors for the week calendar chips
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

const chipLabel = (weekStartIso: string) => {
  const d = new Date(`${weekStartIso}T00:00:00.000Z`);
  const day = d.getUTCDate();
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(d);
  return `${day} ${month}`;
};

const chipYear = (weekStartIso: string) =>
  new Date(`${weekStartIso}T00:00:00.000Z`).getUTCFullYear().toString().slice(-2);

// Generate 53 week start ISO strings: 26 before current + current + 26 after
const generateWeeks = (): string[] => {
  const currentStart = normalizeWeekStart(new Date());
  return Array.from({ length: 53 }, (_, i) =>
    toDateParam(addUtcDays(currentStart, (i - 26) * 7)),
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Site form panel ───────────────────────────────────────────────────────────

function SiteFormPanel({
  form,
  managers,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  form: FormState;
  managers: Manager[];
  saving: boolean;
  onClose: () => void;
  onChange: (f: FormState) => void;
  onSave: () => void;
}) {
  const isEdit = Boolean(form.id);

  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
        {label}
      </label>
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
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
          {field("Default status",
            <select value={form.status} title="Status"
              onChange={(e) => onChange({ ...form, status: e.target.value as ProjectStatus })}
              className={inputCls}>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="done">Done</option>
              <option value="inactive">Inactive</option>
            </select>,
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

// ── Status calendar panel ─────────────────────────────────────────────────────

const ALL_STATUSES: ProjectStatus[] = ["planned", "active", "on_hold", "done", "inactive"];

function SiteStatusCalendar({ site, onClose }: { site: Site; onClose: () => void }) {
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickedStatus, setPickedStatus] = useState<ProjectStatus>("active");
  const [applying, setApplying] = useState(false);
  const [warnOngoing, setWarnOngoing] = useState(false);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const lastClicked = useRef<string | null>(null);
  const currentWeekRef = useRef<HTMLButtonElement | null>(null);
  const weeks = React.useMemo(generateWeeks, []);
  const currentWeekIso = toDateParam(normalizeWeekStart(new Date()));

  useEffect(() => {
    getSiteWeekStatuses(site.id)
      .then((rows) => {
        const map: Record<string, string> = {};
        rows.forEach((r) => { map[r.weekStartIso] = r.status; });
        setStatuses(map);
      })
      .finally(() => setLoading(false));
  }, [site.id]);

  // Scroll to current week after load
  useEffect(() => {
    if (!loading) {
      currentWeekRef.current?.scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" });
    }
  }, [loading]);

  const handleWeekClick = (weekIso: string, e: React.MouseEvent) => {
    setBlockMsg(null);
    setWarnOngoing(false);
    if (e.shiftKey && lastClicked.current) {
      const fromIdx = weeks.indexOf(lastClicked.current);
      const toIdx   = weeks.indexOf(weekIso);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        setSelected((prev) => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(weeks[i]!);
          return next;
        });
        return;
      }
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(weekIso)) next.delete(weekIso);
      else next.add(weekIso);
      return next;
    });
    lastClicked.current = weekIso;
  };

  const applyStatus = async (force = false) => {
    if (selected.size === 0) return;
    setApplying(true);
    setBlockMsg(null);
    try {
      const result = await setSiteWeekStatuses(site.id, [...selected], pickedStatus, force);
      if ("blocked" in result) {
        setBlockMsg(`Cannot set "${STATUS_LABELS[pickedStatus]}" — the site has already moved past the planning phase.`);
        setWarnOngoing(false);
      } else if ("warn" in result) {
        setWarnOngoing(true);
      } else {
        // Refresh statuses from server
        const rows = await getSiteWeekStatuses(site.id);
        const map: Record<string, string> = {};
        rows.forEach((r) => { map[r.weekStartIso] = r.status; });
        setStatuses(map);
        setSelected(new Set());
        setWarnOngoing(false);
      }
    } finally {
      setApplying(false);
    }
  };

  // Group weeks by year for header labels
  const yearBreaks = React.useMemo(() => {
    const breaks: Record<number, string> = {};
    weeks.forEach((iso, i) => {
      const y = new Date(`${iso}T00:00:00.000Z`).getUTCFullYear();
      if (i === 0 || new Date(`${weeks[i - 1]!}T00:00:00.000Z`).getUTCFullYear() !== y) {
        breaks[i] = String(y);
      }
    });
    return breaks;
  }, [weeks]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,860px)] max-h-[min(90vh,560px)] flex flex-col rounded-2xl border border-[#313036] bg-[#1f1e24] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#313036] px-5 py-4 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[#ececef]">Status calendar</h2>
            <p className="text-xs text-[#6b6875] mt-0.5">{site.name}</p>
          </div>
          <button type="button" onClick={onClose} title="Close"
            className="rounded-md p-1 text-[#6b6875] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-1 flex-shrink-0 flex-wrap">
          {ALL_STATUSES.map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-[11px] text-[#6b6875]">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${STATUS_CHIP_BG[s]}`} />
              {STATUS_LABELS[s]}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[11px] text-[#6b6875]">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#28272d]" />
            No status
          </span>
          <span className="ml-auto text-[11px] text-[#4a4950]">
            Click to select · Shift+click for range
          </span>
        </div>

        {/* Week timeline */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[#6b6875]">Loading…</div>
        ) : (
          <div className="flex-1 overflow-x-auto overflow-y-hidden px-5 py-3 min-h-0">
            <div className="flex gap-1 items-end h-full">
              {weeks.map((iso, i) => {
                const status = statuses[iso] as ProjectStatus | undefined;
                const isSelected = selected.has(iso);
                const isCurrent = iso === currentWeekIso;
                const yearLabel = yearBreaks[i];

                return (
                  <div key={iso} className="flex flex-col items-center gap-1 flex-shrink-0">
                    {/* Year label */}
                    <span className="text-[9px] font-semibold text-[#4a4950] h-3">
                      {yearLabel ?? ""}
                    </span>
                    <button
                      ref={isCurrent ? currentWeekRef : null}
                      type="button"
                      title={`${formatWeekLabel(iso)}${status ? ` — ${STATUS_LABELS[status]}` : ""}`}
                      onClick={(e) => handleWeekClick(iso, e)}
                      className={`
                        relative flex flex-col items-center justify-center rounded-md w-[62px] h-[52px] text-[10px] font-medium
                        transition-all select-none
                        ${status ? `${STATUS_CHIP_BG[status]} ${STATUS_CHIP_TEXT[status]}` : "bg-[#28272d] text-[#4a4950]"}
                        ${isSelected ? "ring-2 ring-white/80 ring-offset-1 ring-offset-[#1f1e24]" : "hover:brightness-125"}
                        ${isCurrent ? "ring-2 ring-accent/70 ring-offset-1 ring-offset-[#1f1e24]" : ""}
                      `}
                    >
                      <span className="leading-none">{chipLabel(iso)}</span>
                      <span className="leading-none opacity-60 text-[9px]">{chipYear(iso)}</span>
                      {isCurrent && (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom action area */}
        <div className="border-t border-[#313036] px-5 py-4 flex-shrink-0 flex flex-col gap-3">

          {/* Status picker */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6875] mr-1">
              Set to:
            </span>
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setPickedStatus(s); setBlockMsg(null); setWarnOngoing(false); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  pickedStatus === s
                    ? `${STATUS_CHIP_BG[s]} ${STATUS_CHIP_TEXT[s]} ring-1 ring-white/30`
                    : "bg-[#28272d] text-[#6b6875] hover:text-[#a09fa6]"
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
            <span className="ml-auto text-xs text-[#4a4950]">
              {selected.size > 0 ? `${selected.size} week${selected.size > 1 ? "s" : ""} selected` : "No weeks selected"}
            </span>
          </div>

          {/* Transition info */}
          <div className="text-[10px] text-[#4a4950] flex gap-4">
            <span>Preparation: <span className="text-[#6b6875]">Planned</span></span>
            <span>→</span>
            <span>Ongoing: <span className="text-[#6b6875]">Active, On hold</span></span>
            <span>→</span>
            <span>Completed: <span className="text-[#6b6875]">Done, Inactive</span></span>
          </div>

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
          {warnOngoing && (
            <div className="flex items-start gap-3 rounded-lg border border-[#4a3b1a] bg-[#2c2210] px-3 py-3">
              <svg className="mt-0.5 flex-shrink-0 text-[#fbbf24]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex-1">
                <p className="text-xs font-semibold text-[#fbbf24]">Reverting a completed site to ongoing</p>
                <p className="mt-1 text-[11px] text-[#a09fa6]">
                  All weeks currently marked <strong>Done</strong> or <strong>Inactive</strong> will be reset to <strong>On hold</strong>.
                  This cannot be undone automatically.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button type="button" onClick={() => void applyStatus(true)} disabled={applying}
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

          {/* Apply button row */}
          {!warnOngoing && (
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[#4a4950]">
                Super-status: <span className="text-[#6b6875] font-medium capitalize">{getSuperStatus(pickedStatus)}</span>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="rounded-lg px-4 py-2 text-xs text-[#a09fa6] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void applyStatus(false)}
                  disabled={selected.size === 0 || applying}
                  className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-40 hover:opacity-90"
                >
                  {applying ? "Applying…" : `Apply to ${selected.size} week${selected.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SitesClient({ sites: initialSites, managers }: { sites: Site[]; managers: Manager[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [calendarSite, setCalendarSite] = useState<Site | null>(null);

  const openAdd = () => { setForm(EMPTY_FORM); setFormOpen(true); };

  const openEdit = (site: Site) => {
    setForm({
      id: site.id,
      name: site.name,
      description: site.description ?? "",
      startDate: toInputDate(site.startDate),
      endDate: toInputDate(site.endDate),
      status: site.status,
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
          status: form.status,
          constructionManagerId: form.constructionManagerId || null,
        });
      } else {
        await createSite({
          name: form.name,
          description: form.description || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          status: form.status,
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

  void isPending;

  return (
    <div className="min-h-screen bg-[#17161c] text-[#ececef]">
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-[#313036] bg-[#1f1e24] px-6 py-4">
        <Link href="/board"
          className="flex items-center gap-1.5 text-xs text-[#6b6875] transition-colors hover:text-[#a09fa6]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Board
        </Link>
        <span className="text-[#313036]">/</span>
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
      <main className="p-6">
        {initialSites.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#313036] py-20 text-center">
            <p className="text-sm text-[#6b6875]">No building sites yet</p>
            <button type="button" onClick={openAdd}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90">
              Add your first site
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#313036]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#313036] bg-[#1f1e24]">
                  {["Name", "Status", "Start date", "End date", "Manager", "Description"].map((h) => (
                    <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">{h}</th>
                  ))}
                  <th className="w-24 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {initialSites.map((site, i) => (
                  <tr key={site.id}
                    className={`border-b border-[#252429] transition-colors hover:bg-[#252429] ${i === initialSites.length - 1 ? "border-b-0" : ""}`}>
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
                        {/* Calendar / week statuses */}
                        <button type="button" onClick={() => setCalendarSite(site)} title="Week status calendar"
                          className="rounded-md p-1.5 text-[#6b6875] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </button>
                        {/* Edit */}
                        <button type="button" onClick={() => openEdit(site)} title="Edit"
                          className="rounded-md p-1.5 text-[#6b6875] transition-colors hover:bg-[#313036] hover:text-[#ececef]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {/* Delete */}
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
      {calendarSite && (
        <SiteStatusCalendar site={calendarSite} onClose={() => setCalendarSite(null)} />
      )}
    </div>
  );
}
