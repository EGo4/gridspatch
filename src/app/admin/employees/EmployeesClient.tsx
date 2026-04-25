"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEmployee, updateEmployee, deleteEmployee } from "~/server/actions/employees";
import { UserIcon } from "~/components/icons";
import { Sidebar } from "~/components/Sidebar";

// ── Types ─────────────────────────────────────────────────────────────────────

type Employee = {
  id: string;
  name: string;
  initials: string;
  img: string | null;
  role: string | null;
};

type FormState = {
  id?: string;
  name: string;
  initials: string;
  /** Saved URL (existing or just uploaded). */
  img: string;
  role: string;
  /** File picked by the user, not yet uploaded. */
  pendingFile: File | null;
};

const EMPTY_FORM: FormState = {
  name: "",
  initials: "",
  img: "",
  role: "",
  pendingFile: null,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function PhotoPicker({
  img,
  pendingFile,
  onChange,
}: {
  img: string;
  pendingFile: File | null;
  onChange: (img: string, pendingFile: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewSrc = pendingFile ? URL.createObjectURL(pendingFile) : img || null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) onChange(img, file);
    // Reset so selecting the same file again still fires onChange
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-4">
      {/* Avatar preview */}
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#313036] bg-[#17161c]">
        {previewSrc ? (
          <img src={previewSrc} alt="Preview" className="h-full w-full object-cover" />
        ) : (
          <UserIcon size={28} className="text-[#4a4950]" />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-[#313036] bg-[#17161c] px-3 py-1.5 text-xs text-[#a09fa6] transition-colors hover:border-[#4a4950] hover:text-[#ececef]"
        >
          {previewSrc ? "Change photo" : "Upload photo"}
        </button>

        {previewSrc && (
          <button
            type="button"
            onClick={() => onChange("", null)}
            className="text-left text-xs text-[#6b6875] transition-colors hover:text-[#f87171]"
          >
            Remove
          </button>
        )}

        <p className="text-[11px] text-[#4a4950]">JPEG, PNG, WebP · max 5 MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        aria-label="Upload employee photo"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

function EmployeeFormPanel({
  form,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  form: FormState;
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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#313036] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#ececef]">
            {isEdit ? "Edit employee" : "New employee"}
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
            "Photo",
            <PhotoPicker
              img={form.img}
              pendingFile={form.pendingFile}
              onChange={(img, pendingFile) => onChange({ ...form, img, pendingFile })}
            />,
          )}

          {field(
            "Name *",
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              placeholder="e.g. John Smith"
              className={inputCls}
              autoFocus
            />,
          )}

          {field(
            "Initials *",
            <input
              type="text"
              value={form.initials}
              onChange={(e) => onChange({ ...form, initials: e.target.value.toUpperCase().slice(0, 4) })}
              placeholder="e.g. JS"
              maxLength={4}
              className={inputCls}
            />,
          )}

          {field(
            "Role",
            <input
              type="text"
              value={form.role}
              onChange={(e) => onChange({ ...form, role: e.target.value })}
              placeholder="e.g. Foreman, Apprentice"
              className={inputCls}
            />,
          )}
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
            disabled={!form.name.trim() || !form.initials.trim() || saving}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create employee"}
          </button>
        </div>
      </div>
    </>
  );
}

function DeleteConfirmPanel({
  employee,
  deleting,
  onClose,
  onConfirm,
}: {
  employee: Employee;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#313036] bg-[#1f1e24] p-6 shadow-2xl">
        <h2 className="mb-2 text-sm font-semibold text-[#ececef]">Delete employee?</h2>
        <p className="mb-5 text-xs text-[#a09fa6]">
          <span className="font-medium text-[#ececef]">{employee.name}</span> will be permanently
          deleted. All their assignments will be deleted too.
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

// ── Sorting ───────────────────────────────────────────────────────────────────

type EmpSortKey = "name" | "initials" | "role";
type SortDir = "asc" | "desc" | null;

function SortIcon({ dir }: { dir: SortDir }) {
  if (dir === "asc") return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block ml-1">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
  if (dir === "desc") return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block ml-1">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block ml-1 opacity-30">
      <polyline points="18 15 12 9 6 15" /><polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function EmployeesClient({ employees: initialEmployees }: { employees: Employee[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [navSidebarOpen, setNavSidebarOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [sortKey, setSortKey] = useState<EmpSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = (key: EmpSortKey) => {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir(null); }
  };

  const sortedEmployees = [...initialEmployees].sort((a, b) => {
    if (!sortKey || !sortDir) return 0;
    const va = (a[sortKey] ?? "").toLowerCase();
    const vb = (b[sortKey] ?? "").toLowerCase();
    return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setForm({
      id: employee.id,
      name: employee.name,
      initials: employee.initials,
      img: employee.img ?? "",
      role: employee.role ?? "",
      pendingFile: null,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.initials.trim()) return;
    setSaving(true);
    try {
      let imgUrl = form.img || null;

      if (form.pendingFile) {
        const fd = new FormData();
        fd.append("file", form.pendingFile);
        const res = await fetch("/api/upload/employees", { method: "POST", body: fd });
        if (!res.ok) throw new Error("Upload failed");
        const data = (await res.json()) as { url: string };
        imgUrl = data.url;
      }

      if (form.id) {
        await updateEmployee({ id: form.id, name: form.name, initials: form.initials, img: imgUrl, role: form.role || null });
      } else {
        await createEmployee({ name: form.name, initials: form.initials, img: imgUrl, role: form.role || null });
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
      await deleteEmployee(deleteTarget.id);
      setDeleteTarget(null);
      startTransition(() => router.refresh());
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-dvh bg-[#17161c] text-[#ececef]">
      <Sidebar mobileOpen={navSidebarOpen} onMobileClose={() => setNavSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-h-0 min-w-0">

      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center gap-4 border-b border-[#313036] bg-[#1f1e24] px-6 py-4">
        <h1 className="text-sm font-semibold text-[#ececef]">Employees</h1>

        <button
          type="button"
          onClick={openAdd}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add employee
        </button>
      </header>

      {/* Table */}
      <main className="flex-1 overflow-auto p-6">
        {initialEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#313036] py-20 text-center">
            <p className="text-sm text-[#6b6875]">No employees yet</p>
            <button
              type="button"
              onClick={openAdd}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Add your first employee
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#313036]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#313036] bg-[#1f1e24]">
                  {([ ["name", "Name"], ["initials", "Initials"], ["role", "Role"] ] as [EmpSortKey, string][]).map(([key, label]) => (
                    <th key={key} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
                      <button type="button" onClick={() => handleSort(key)} className="flex items-center gap-0.5 transition-colors hover:text-[#ececef]">
                        {label}<SortIcon dir={sortKey === key ? sortDir : null} />
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="w-20 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-transparent" aria-label="Actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.map((employee, i) => (
                  <tr
                    key={employee.id}
                    className={`border-b border-[#252429] transition-colors hover:bg-[#252429] ${
                      i === sortedEmployees.length - 1 ? "border-b-0" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {employee.img ? (
                          <img
                            src={employee.img}
                            alt={employee.name}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#313036]">
                            <UserIcon size={16} className="text-[#6b6875]" />
                          </div>
                        )}
                        <span className="font-medium text-[#ececef]">{employee.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#a09fa6]">
                      {employee.initials}
                    </td>
                    <td className="px-4 py-3 text-[#a09fa6]">
                      {employee.role ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(employee)}
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
                          onClick={() => setDeleteTarget(employee)}
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
        <EmployeeFormPanel
          form={form}
          saving={saving}
          onClose={() => setFormOpen(false)}
          onChange={setForm}
          onSave={handleSave}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmPanel
          employee={deleteTarget}
          deleting={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
      </div>
      <button
        type="button"
        onClick={() => setNavSidebarOpen(true)}
        title="Open menu"
        className="fixed bottom-4 left-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-[#28272d] text-[#a09fa6] shadow-lg transition-colors hover:bg-[#313036] hover:text-[#ececef] lg:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
    </div>
  );
}
