"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEmployee, updateEmployee, deleteEmployee, bulkCreateEmployees } from "~/server/actions/employees";
import { UserIcon } from "~/components/icons";
import { Sidebar } from "~/components/Sidebar";

// ── Types ─────────────────────────────────────────────────────────────────────

type Employee = {
  id: string;
  name: string;
  initials: string;
  img: string | null;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
};

type FormState = {
  id?: string;
  name: string;
  initials: string;
  /** Saved URL (existing or just uploaded). */
  img: string;
  role: string;
  startDate: string;
  endDate: string;
  /** File picked by the user, not yet uploaded. */
  pendingFile: File | null;
};

const EMPTY_FORM: FormState = {
  name: "",
  initials: "",
  img: "",
  role: "",
  startDate: "",
  endDate: "",
  pendingFile: null,
};

type ImportedEmployee = { name: string; initials: string; role: string | null };

function deriveInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 4) || "?"
  );
}

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
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]">
        {previewSrc ? (
          <img src={previewSrc} alt="Preview" className="h-full w-full object-cover" />
        ) : (
          <UserIcon size={28} className="text-[var(--color-text-faint)]" />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
        >
          {previewSrc ? "Change photo" : "Upload photo"}
        </button>

        {previewSrc && (
          <button
            type="button"
            onClick={() => onChange("", null)}
            className="text-left text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-danger-text)]"
          >
            Remove
          </button>
        )}

        <p className="text-[11px] text-[var(--color-text-faint)]">JPEG, PNG, WebP · max 5 MB</p>
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
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </label>
      {node}
    </div>
  );

  const inputCls =
    "w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[#4a4950] outline-none focus:border-[var(--color-accent)] transition-colors";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {isEdit ? "Edit employee" : "New employee"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]"
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

          {field(
            "Start date",
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => onChange({ ...form, startDate: e.target.value })}
              className={inputCls}
            />,
          )}

          {field(
            "End date",
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => onChange({ ...form, endDate: e.target.value })}
              className={inputCls}
            />,
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]"
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
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] p-6 shadow-2xl">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">Delete employee?</h2>
        <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
          <span className="font-medium text-[var(--color-text-primary)]">{employee.name}</span> will be permanently
          deleted. All their assignments will be deleted too.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-[#5c1e1e] px-4 py-2 text-sm font-medium text-[var(--color-danger-text)] transition-opacity disabled:opacity-40 hover:bg-[#6e2424]"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── List import panel ─────────────────────────────────────────────────────────

function EmployeeListImportPanel({
  onClose,
  onImport,
  importing,
}: {
  onClose: () => void;
  onImport: (items: ImportedEmployee[]) => void;
  importing: boolean;
}) {
  const [text, setText] = useState("");
  const parsed: ImportedEmployee[] = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((name) => ({ name, initials: deriveInitials(name), role: null }));

  const inputCls =
    "w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[#4a4950] outline-none focus:border-[var(--color-accent)] transition-colors";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,480px)] max-h-[min(90vh,600px)] flex flex-col rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Import from list</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">One name per line — initials are auto-derived.</p>
          </div>
          <button type="button" onClick={onClose} title="Close"
            className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 min-h-0">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"John Smith\nJane Doe\nBob Johnson"}
            rows={6}
            className={`${inputCls} resize-none`}
            autoFocus
          />
          {parsed.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Preview — {parsed.length} employee{parsed.length !== 1 ? "s" : ""}
              </p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--color-border-subtle)] divide-y divide-[#252429]">
                {parsed.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 text-sm text-[var(--color-text-primary)]">{item.name}</span>
                    <span className="font-mono text-[11px] text-[var(--color-text-muted)] bg-[var(--color-border-subtle)] rounded px-1.5 py-0.5">
                      {item.initials}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]">
            Cancel
          </button>
          <button type="button" onClick={() => onImport(parsed)}
            disabled={parsed.length === 0 || importing}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90">
            {importing ? "Importing…" : `Import ${parsed.length || ""} employee${parsed.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </>
  );
}

// ── JSON import panel ─────────────────────────────────────────────────────────

function EmployeeJsonImportPanel({
  onClose,
  onImport,
  importing,
  parsed,
  error,
}: {
  onClose: () => void;
  onImport: () => void;
  importing: boolean;
  parsed: ImportedEmployee[] | null;
  error: string | null;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(96vw,480px)] max-h-[min(90vh,560px)] flex flex-col rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Import from JSON</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Import a previously exported employees file.</p>
          </div>
          <button type="button" onClick={onClose} title="Close"
            className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 min-h-0">
          {error && (
            <div className="rounded-lg border border-[#5c1e1e] bg-[#3a1414] px-4 py-3 text-xs text-[var(--color-danger-text)]">
              {error}
            </div>
          )}
          {parsed && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                {parsed.length} employee{parsed.length !== 1 ? "s" : ""} ready to import
              </p>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--color-border-subtle)] divide-y divide-[#252429]">
                {parsed.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 text-sm text-[var(--color-text-primary)]">{item.name}</span>
                    <span className="font-mono text-[11px] text-[var(--color-text-muted)] bg-[var(--color-border-subtle)] rounded px-1.5 py-0.5">
                      {item.initials}
                    </span>
                    {item.role && (
                      <span className="text-[11px] text-[var(--color-text-secondary)]">{item.role}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]">
            Cancel
          </button>
          <button type="button" onClick={onImport}
            disabled={!parsed || parsed.length === 0 || importing}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90">
            {importing ? "Importing…" : `Import ${parsed?.length ?? ""} employee${(parsed?.length ?? 0) !== 1 ? "s" : ""}`}
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

  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [listImportOpen, setListImportOpen] = useState(false);
  const [jsonImportParsed, setJsonImportParsed] = useState<ImportedEmployee[] | null>(null);
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importBtnRef = useRef<HTMLButtonElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!importMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!importMenuRef.current?.contains(t) && !importBtnRef.current?.contains(t)) {
        setImportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [importMenuOpen]);

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

  const handleExport = () => {
    const data = initialEmployees.map((e) => ({
      name: e.name,
      initials: e.initials,
      role: e.role ?? null,
    }));
    const blob = new Blob(
      [JSON.stringify({ version: 1, type: "employees", exported: new Date().toISOString(), data }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gridspatch-employees-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json: unknown = JSON.parse(ev.target?.result as string);
        let items: unknown[];
        if (Array.isArray(json)) {
          items = json;
        } else if (json && typeof json === "object" && Array.isArray((json as Record<string, unknown>).data)) {
          items = (json as Record<string, unknown>).data as unknown[];
        } else {
          setJsonImportError("Invalid format. Expected an array or an exported JSON file.");
          setJsonImportParsed(null);
          return;
        }
        const valid: ImportedEmployee[] = items
          .filter((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string")
          .map((item) => {
            const i = item as Record<string, unknown>;
            const name = String(i.name).trim();
            const initials =
              typeof i.initials === "string"
                ? i.initials.trim().toUpperCase().slice(0, 4) || deriveInitials(name)
                : deriveInitials(name);
            const role = typeof i.role === "string" ? i.role.trim() || null : null;
            return { name, initials, role };
          })
          .filter((emp) => emp.name && emp.initials);
        if (valid.length === 0) {
          setJsonImportError("No valid employees found in the file.");
          setJsonImportParsed(null);
          return;
        }
        setJsonImportParsed(valid);
        setJsonImportError(null);
      } catch {
        setJsonImportError("Could not parse file. Make sure it is valid JSON.");
        setJsonImportParsed(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleListImport = async (items: ImportedEmployee[]) => {
    setImporting(true);
    try {
      await bulkCreateEmployees(items);
      setListImportOpen(false);
      startTransition(() => router.refresh());
    } finally {
      setImporting(false);
    }
  };

  const handleJsonImport = async () => {
    if (!jsonImportParsed) return;
    setImporting(true);
    try {
      await bulkCreateEmployees(jsonImportParsed);
      setJsonImportParsed(null);
      setJsonImportError(null);
      startTransition(() => router.refresh());
    } finally {
      setImporting(false);
    }
  };

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
      startDate: employee.startDate ?? "",
      endDate: employee.endDate ?? "",
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
        await updateEmployee({ id: form.id, name: form.name, initials: form.initials, img: imgUrl, role: form.role || null, startDate: form.startDate || null, endDate: form.endDate || null });
      } else {
        await createEmployee({ name: form.name, initials: form.initials, img: imgUrl, role: form.role || null, startDate: form.startDate || null, endDate: form.endDate || null });
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
    <div className="flex h-dvh bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <Sidebar mobileOpen={navSidebarOpen} onMobileClose={() => setNavSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-h-0 min-w-0 lg:pl-14">

      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center gap-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] px-6 py-4">
        <button
          type="button"
          onClick={() => setNavSidebarOpen(true)}
          title="Open menu"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] lg:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">Employees</h1>

        <div className="ml-auto flex items-center gap-2">
          {/* Import dropdown */}
          <div className="relative">
            <button
              ref={importBtnRef}
              type="button"
              onClick={() => setImportMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Import
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform ${importMenuOpen ? "rotate-180" : ""}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {importMenuOpen && (
              <div
                ref={importMenuRef}
                className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] shadow-xl overflow-hidden"
              >
                <button type="button"
                  onClick={() => { setListImportOpen(true); setImportMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  Paste list
                </button>
                <button type="button"
                  onClick={() => { jsonFileInputRef.current?.click(); setImportMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Import JSON
                </button>
              </div>
            )}
          </div>

          {/* Export */}
          <button type="button" onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>

          {/* Add */}
          <button type="button" onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add employee
          </button>
        </div>

        <input ref={jsonFileInputRef} type="file" accept=".json,application/json" aria-label="Import JSON" className="hidden" onChange={handleJsonFile} />
      </header>

      {/* Table */}
      <main className="flex-1 overflow-y-auto overflow-x-clip p-6">
        {initialEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--color-border-subtle)] py-20 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">No employees yet</p>
            <button
              type="button"
              onClick={openAdd}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Add your first employee
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border-subtle)]">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-page)]">
                  {([ ["name", "Name"], ["initials", "Initials"], ["role", "Role"] ] as [EmpSortKey, string][]).map(([key, label]) => (
                    <th key={key} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      <button type="button" onClick={() => handleSort(key)} className="flex items-center gap-0.5 transition-colors hover:text-[var(--color-text-primary)]">
                        {label}<SortIcon dir={sortKey === key ? sortDir : null} />
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Period</th>
                  <th scope="col" className="w-20 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-transparent" aria-label="Actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.map((employee, i) => (
                  <tr
                    key={employee.id}
                    className={`border-b border-[#252429] transition-colors hover:bg-[var(--color-bg-raised)] ${
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
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-border-subtle)]">
                            <UserIcon size={16} className="text-[var(--color-text-muted)]" />
                          </div>
                        )}
                        <span className="font-medium text-[var(--color-text-primary)]">{employee.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
                      {employee.initials}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {employee.role ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] tabular-nums">
                      {employee.startDate ?? "∞"} — {employee.endDate ?? "∞"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(employee)}
                          title="Edit"
                          className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]"
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
                          className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[#3a1e1e] hover:text-[var(--color-danger-text)]"
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

      {listImportOpen && (
        <EmployeeListImportPanel
          onClose={() => setListImportOpen(false)}
          onImport={(items) => void handleListImport(items)}
          importing={importing}
        />
      )}

      {(jsonImportParsed ?? jsonImportError) && (
        <EmployeeJsonImportPanel
          onClose={() => { setJsonImportParsed(null); setJsonImportError(null); }}
          onImport={() => void handleJsonImport()}
          importing={importing}
          parsed={jsonImportParsed}
          error={jsonImportError}
        />
      )}
      </div>
    </div>
  );
}
