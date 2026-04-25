"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "~/components/Sidebar";
import { updateCurrentUser, changeCurrentUserPassword } from "~/server/actions/users";
import { UserIcon } from "~/components/icons";

// ── Types ─────────────────────────────────────────────────────────────────────

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  construction_manager: "Construction Manager",
  admin: "Admin",
};

const ROLE_STYLES: Record<string, string> = {
  construction_manager: "bg-[#1a2c3d] text-[#60a5fa] border border-[#1e3a52]",
  admin: "bg-[#2c1a3d] text-[#c084fc] border border-[#3a1e52]",
};

const inputCls =
  "w-full rounded-lg border border-[#313036] bg-[#17161c] px-3 py-2 text-sm text-[#ececef] placeholder-[#4a4950] outline-none focus:border-[var(--color-accent)] transition-colors";

// ── Photo picker ──────────────────────────────────────────────────────────────

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
      <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#313036] bg-[#17161c]">
        {previewSrc ? (
          <img src={previewSrc} alt="Profile photo" className="h-full w-full object-cover" />
        ) : (
          <UserIcon size={32} className="text-[#4a4950]" />
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
        aria-label="Upload profile photo"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileClient({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [navSidebarOpen, setNavSidebarOpen] = useState(false);

  // Profile fields
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [image, setImage] = useState(user.image ?? "");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const uploadPhoto = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/users", { method: "POST", body: fd });
    if (!res.ok) throw new Error("Photo upload failed");
    const data = (await res.json()) as { url: string };
    return data.url;
  };

  const passwordMismatch = newPassword.length > 0 && newPassword !== confirmPassword;
  const passwordTooShort = newPassword.length > 0 && newPassword.length < 8;
  const currentPasswordRequired = newPassword.length > 0 && currentPassword.length === 0;
  const canSave =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    !passwordMismatch &&
    !passwordTooShort &&
    !currentPasswordRequired;

  const handleSave = async () => {
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      let imageUrl = image || null;
      if (pendingFile) {
        imageUrl = await uploadPhoto(pendingFile);
      }

      await updateCurrentUser({ name, email, image: imageUrl });

      if (newPassword) {
        await changeCurrentUserPassword({ currentPassword, newPassword });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }

      if (imageUrl !== image) {
        setImage(imageUrl ?? "");
        setPendingFile(null);
      }

      setSuccessMsg("Changes saved.");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">
        {label}
      </label>
      {node}
    </div>
  );

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
        <h1 className="text-sm font-semibold text-[#ececef]">Account</h1>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
      <div className="mx-auto max-w-lg px-6 py-8">

        {/* Error / success banners */}
        {error && (
          <div className="mb-6 rounded-lg border border-[#5c1e1e] bg-[#3a1414] px-4 py-3 text-xs text-[#f87171]">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-6 rounded-lg border border-[#1a3a2e] bg-[#0f2920] px-4 py-3 text-xs text-[#4ade80]">
            {successMsg}
          </div>
        )}

        {/* Profile card */}
        <div className="rounded-xl border border-[#313036] bg-[#1f1e24]">

          {/* Section: Identity */}
          <div className="flex flex-col gap-5 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">Profile</p>

            {field(
              "Photo",
              <PhotoPicker
                image={image}
                pendingFile={pendingFile}
                onChange={(img, file) => { setImage(img); setPendingFile(file); }}
              />,
            )}

            {field(
              "Name",
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={inputCls}
              />,
            )}

            {field(
              "Email",
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputCls}
              />,
            )}

            {field(
              "Role",
              <div className="flex items-center gap-2 py-1">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    ROLE_STYLES[user.role] ?? "bg-[#252429] text-[#6b6875] border border-[#313036]"
                  }`}
                >
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
                <span className="text-[11px] text-[#4a4950]">Managed by admins</span>
              </div>,
            )}
          </div>

          <div className="border-t border-[#313036]" />

          {/* Section: Password */}
          <div className="flex flex-col gap-5 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6b6875]">Change password</p>
            <p className="text-xs text-[#6b6875]">Leave blank to keep your current password. Enter your current password to confirm any change.</p>

            {field(
              "Current password",
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Required to change password"
                className={inputCls}
                autoComplete="current-password"
              />,
            )}

            {field(
              "New password",
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className={inputCls}
                autoComplete="new-password"
              />,
            )}

            {field(
              "Confirm password",
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className={inputCls}
                autoComplete="new-password"
              />,
            )}

            {passwordTooShort && (
              <p className="text-[11px] text-[#f87171]">Password must be at least 8 characters.</p>
            )}
            {currentPasswordRequired && (
              <p className="text-[11px] text-[#f87171]">Current password is required to set a new password.</p>
            )}
            {passwordMismatch && (
              <p className="text-[11px] text-[#f87171]">Passwords do not match.</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[#313036] px-6 py-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="rounded-lg bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
      </main>
      </div>
    </div>
  );
}
