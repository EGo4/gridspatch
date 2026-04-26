"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "~/components/Sidebar";
import {
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  type UserRole,
} from "~/server/actions/users";
import { UserIcon } from "~/components/icons";

// ── Types ─────────────────────────────────────────────────────────────────────

type User = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  createdAt: Date;
};

type FormState = {
  id?: string;
  name: string;
  email: string;
  password: string;
  adminPassword: string;
  role: UserRole;
  image: string;
  pendingFile: File | null;
};

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  password: "",
  adminPassword: "",
  role: "construction_manager",
  image: "",
  pendingFile: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  construction_manager: "Manager",
  admin: "Admin",
};

const ROLE_STYLES: Record<string, string> = {
  construction_manager: "bg-[var(--color-status-planned-bg)] text-[var(--color-status-planned-txt)] border border-[var(--color-border-subtle)]",
  admin:                "bg-[var(--color-status-done-bg)] text-[var(--color-status-done-txt)] border border-[var(--color-border-subtle)]",
};

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role] ?? role;
  const style = ROLE_STYLES[role] ?? "bg-[var(--color-bg-raised)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>
      {label}
    </span>
  );
}

// ── Photo picker (same as employees) ─────────────────────────────────────────

function PhotoPicker({
  image,
  pendingFile,
  onChange,
}: {
  image: string;
  pendingFile: File | null;
  onChange: (image: string, pendingFile: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewSrc = pendingFile ? URL.createObjectURL(pendingFile) : image || null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) onChange(image, file);
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-4">
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
        aria-label="Upload user photo"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

// ── Form panel ────────────────────────────────────────────────────────────────

function UserFormPanel({
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

  const newPasswordTooShort = !isEdit && form.password.length > 0 && form.password.length < 8;
  const adminPasswordRequired = isEdit && form.password.length > 0 && form.adminPassword.length === 0;
  const canSave =
    form.name.trim() &&
    form.email.trim() &&
    (isEdit || form.password.length >= 8) &&
    !adminPasswordRequired;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
            {isEdit ? "Edit user" : "New user"}
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
              image={form.image}
              pendingFile={form.pendingFile}
              onChange={(image, pendingFile) => onChange({ ...form, image, pendingFile })}
            />,
          )}

          {field(
            "Name *",
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              placeholder="e.g. Anna Müller"
              className={inputCls}
              autoFocus
            />,
          )}

          {field(
            "Email *",
            <input
              type="email"
              value={form.email}
              onChange={(e) => onChange({ ...form, email: e.target.value })}
              placeholder="anna@example.com"
              className={inputCls}
            />,
          )}

          {field(
            "Role",
            <select
              value={form.role}
              title="Role"
              onChange={(e) => onChange({ ...form, role: e.target.value as UserRole })}
              className={inputCls}
            >
              <option value="construction_manager">Construction Manager</option>
              <option value="admin">Admin</option>
            </select>,
          )}

          {field(
            isEdit ? "New password (leave blank to keep current)" : "Password *",
            <input
              type="password"
              value={form.password}
              onChange={(e) => onChange({ ...form, password: e.target.value })}
              placeholder={isEdit ? "Enter to change…" : "Min. 8 characters"}
              className={inputCls}
              autoComplete="new-password"
            />,
          )}

          {isEdit && (
            <>
              {field(
                "Your admin password",
                <input
                  type="password"
                  value={form.adminPassword}
                  onChange={(e) => onChange({ ...form, adminPassword: e.target.value })}
                  placeholder="Required to change this user's password"
                  className={inputCls}
                  autoComplete="current-password"
                />,
              )}
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Required only when setting a new password for this user.
              </p>
            </>
          )}

          {newPasswordTooShort && (
            <p className="text-[11px] text-[var(--color-danger-text)]">Password must be at least 8 characters.</p>
          )}
          {adminPasswordRequired && (
            <p className="text-[11px] text-[var(--color-danger-text)]">
              Your admin password is required to change another user&apos;s password.
            </p>
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
            disabled={!canSave || saving}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create user"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirmPanel({
  user,
  deleting,
  onClose,
  onConfirm,
}: {
  user: User;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] p-6 shadow-2xl">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">Delete user?</h2>
        <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
          <span className="font-medium text-[var(--color-text-primary)]">{user.name}</span> ({user.email}) will be
          permanently deleted including all their sessions and login data.
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

// ── Main component ────────────────────────────────────────────────────────────

export function UsersClient({ users: initialUsers }: { users: User[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [navSidebarOpen, setNavSidebarOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (user: User) => {
    setForm({
      id: user.id,
      name: user.name,
      email: user.email,
      password: "",
      adminPassword: "",
      role: (user.role as UserRole) ?? "construction_manager",
      image: user.image ?? "",
      pendingFile: null,
    });
    setError(null);
    setFormOpen(true);
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/users", { method: "POST", body: fd });
    if (!res.ok) throw new Error("Photo upload failed");
    const data = (await res.json()) as { url: string };
    return data.url;
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      let imageUrl = form.image || null;
      if (form.pendingFile) {
        imageUrl = await uploadPhoto(form.pendingFile);
      }

      if (form.id) {
        await updateUser({
          id: form.id,
          name: form.name,
          email: form.email,
          role: form.role,
          image: imageUrl,
        });
        if (form.password) {
          await resetUserPassword({
            userId: form.id,
            newPassword: form.password,
            adminPassword: form.adminPassword,
          });
        }
      } else {
        await createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          image: imageUrl,
        });
      }

      setFormOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
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
        <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">Users</h1>

        <button
          type="button"
          onClick={openAdd}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add user
        </button>
      </header>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-[#5c1e1e] bg-[#3a1414] px-4 py-3 text-xs text-[var(--color-danger-text)]">
          {error}
        </div>
      )}

      {/* Table */}
      <main className="flex-1 overflow-y-auto overflow-x-clip p-6">
        {initialUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--color-border-subtle)] py-20 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">No users yet</p>
            <p className="text-xs text-[var(--color-text-faint)]">The first user you create will become the admin.</p>
            <button
              type="button"
              onClick={openAdd}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Create first user
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-border-subtle)]">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-page)]">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Name</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Email</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Role</th>
                  <th scope="col" className="w-20 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-transparent">Actions</th>
                </tr>
              </thead>
              <tbody>
                {initialUsers.map((user, i) => (
                  <tr
                    key={user.id}
                    className={`border-b border-[#252429] transition-colors hover:bg-[var(--color-bg-raised)] ${
                      i === initialUsers.length - 1 ? "border-b-0" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.image ? (
                          <img
                            src={user.image}
                            alt={user.name}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-border-subtle)]">
                            <UserIcon size={16} className="text-[var(--color-text-muted)]" />
                          </div>
                        )}
                        <span className="font-medium text-[var(--color-text-primary)]">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{user.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
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
                          onClick={() => setDeleteTarget(user)}
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
        <>
          <UserFormPanel
            form={form}
            saving={saving}
            onClose={() => setFormOpen(false)}
            onChange={setForm}
            onSave={handleSave}
          />
          {error && (
            <div className="fixed bottom-20 right-4 z-[60] rounded-lg border border-[#5c1e1e] bg-[#3a1414] px-4 py-3 text-xs text-[var(--color-danger-text)] shadow-lg">
              {error}
            </div>
          )}
        </>
      )}

      {deleteTarget && (
        <DeleteConfirmPanel
          user={deleteTarget}
          deleting={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
      </div>
    </div>
  );
}
