"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "~/types";
import { createSite, updateSite, deleteSite } from "~/server/actions/sites";

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
  status: "active",
  constructionManagerId: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  not_active: "Inactive",
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
  active:     "bg-[#0f2e1e] text-[#4ade80] border border-[#1a4a2e]",
  on_hold:    "bg-[#2c2619] text-[#fbbf24] border border-[#3d3319]",
  not_active: "bg-[#252429] text-[#6b6875] border border-[#313036]",
};

const toInputDate = (d: Date | null) =>
  d ? d.toISOString().slice(0, 10) : "";

const formatDate = (d: Date | null) =>
  d
    ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-[#313036] bg-[#1f1e24] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#313036] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#ececef]">
            {isEdit ? "Edit building site" : "New building site"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="rounded-md p-1 text-[#6b6875] transition-colors hover:bg-[#313036] hover:text-[#ececef]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-6">
          {field(
            "Name *",
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              placeholder="e.g. Site Müller – Hauptstraße"
              className={inputCls}
              autoFocus
            />,
          )}

          {field(
            "Description",
            <textarea
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              placeholder="Optional notes about this site"
              rows={3}
              className={`${inputCls} resize-none`}
            />,
          )}

          {field(
            "Status",
            <select
              value={form.status}
              title="Status"
              onChange={(e) => onChange({ ...form, status: e.target.value as ProjectStatus })}
              className={inputCls}
            >
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="not_active">Inactive</option>
            </select>,
          )}

          {field(
            "Construction manager",
            <select
              value={form.constructionManagerId}
              title="Construction manager"
              onChange={(e) => onChange({ ...form, constructionManagerId: e.target.value })}
              className={inputCls}
            >
              <option value="">— None —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>,
          )}

          <div className="grid grid-cols-2 gap-3">
            {field(
              "Start date",
              <input
                type="date"
                value={form.startDate}
                title="Start date"
                onChange={(e) => onChange({ ...form, startDate: e.target.value })}
                className={inputCls}
              />,
            )}
            {field(
              "End date",
              <input
                type="date"
                value={form.endDate}
                title="End date"
                onChange={(e) => onChange({ ...form, endDate: e.target.value })}
                className={inputCls}
              />,
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[#313036] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[#a09fa6] transition-colors hover:bg-[#313036] hover:text-[#ececef]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!form.name.trim() || saving}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create site"}
          </button>
        </div>
      </div>
    </>
  );
}

function DeleteConfirmPanel({
  site,
  deleting,
  onClose,
  onConfirm,
}: {
  site: Site;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[#a09fa6] transition-colors hover:bg-[#313036] hover:text-[#ececef]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-[#5c1e1e] px-4 py-2 text-sm font-medium text-[#f87171] transition-opacity disabled:opacity-40 hover:bg-[#6e2424]"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
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

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

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

  const closeForm = () => setFormOpen(false);

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

  // Keep local list in sync after server refresh
  // (router.refresh() re-fetches server component data which re-mounts with new props)

  return (
    <div className="min-h-screen bg-[#17161c] text-[#ececef]">
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-[#313036] bg-[#1f1e24] px-6 py-4">
        <Link
          href="/board"
          className="flex items-center gap-1.5 text-xs text-[#6b6875] transition-colors hover:text-[#a09fa6]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Board
        </Link>
        <span className="text-[#313036]">/</span>
        <h1 className="text-sm font-semibold text-[#ececef]">Building Sites</h1>

        <button
          type="button"
          onClick={openAdd}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add site
        </button>
      </header>

      {/* Table */}
      <main className="p-6">
        {initialSites.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#313036] py-20 text-center">
            <p className="text-sm text-[#6b6875]">No building sites yet</p>
            <button
              type="button"
              onClick={openAdd}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Add your first site
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#313036]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#313036] bg-[#1f1e24]">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
                    Name
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
                    Start date
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
                    End date
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
                    Manager
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
                    Description
                  </th>
                  <th className="w-20 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]" aria-label="Actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {initialSites.map((site, i) => (
                  <tr
                    key={site.id}
                    className={`border-b border-[#252429] transition-colors hover:bg-[#252429] ${
                      i === initialSites.length - 1 ? "border-b-0" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-[#ececef]">{site.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={site.status} />
                    </td>
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
                        <button
                          type="button"
                          onClick={() => openEdit(site)}
                          title="Edit"
                          className="rounded-md p-1.5 text-[#6b6875] transition-colors hover:bg-[#313036] hover:text-[#ececef]"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(site)}
                          title="Delete"
                          className="rounded-md p-1.5 text-[#6b6875] transition-colors hover:bg-[#3a1e1e] hover:text-[#f87171]"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
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
        <SiteFormPanel
          form={form}
          managers={managers}
          saving={saving}
          onClose={closeForm}
          onChange={setForm}
          onSave={handleSave}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmPanel
          site={deleteTarget}
          deleting={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
