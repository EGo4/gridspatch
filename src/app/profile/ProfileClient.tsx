"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "~/components/Sidebar";
import { updateCurrentUser, changeCurrentUserPassword } from "~/server/actions/users";
import { saveUserPreferences, type UserPrefs } from "~/server/actions/preferences";
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
  construction_manager: "bg-[var(--color-status-planned-bg)] text-[var(--color-status-planned-txt)] border border-[var(--color-border-subtle)]",
  admin: "bg-[var(--color-status-done-bg)] text-[var(--color-status-done-txt)] border border-[var(--color-border-subtle)]",
};

const inputCls =
  "w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] outline-none focus:border-[var(--color-accent)] transition-colors";

// Defaults match the globals.css hue values
const DEFAULT_ACCENT = "#4f7cf0";
const DEFAULT_AM_HUE = "#dcbe7d";
const DEFAULT_PM_HUE = "#82aafa";
const DEFAULT_SCALE = 1;

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
      <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)]">
        {previewSrc ? (
          <img src={previewSrc} alt="Profile photo" className="h-full w-full object-cover" />
        ) : (
          <UserIcon size={32} className="text-[var(--color-text-faint)]" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
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
        aria-label="Upload profile photo"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

// ── Color swatch picker ───────────────────────────────────────────────────────

function ColorField({
  label,
  hint,
  value,
  onChange,
  onReset,
  previewStyle,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  previewStyle?: React.CSSProperties;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="h-9 w-9 flex-shrink-0 cursor-pointer rounded-lg border-2 border-[var(--color-border-subtle)] transition-colors hover:border-[var(--color-border-strong)]"
          style={{ backgroundColor: value }}
          title="Click to pick colour"
        />
        {previewStyle && (
          <div
            className="h-9 w-9 flex-shrink-0 rounded-lg border border-[var(--color-border-subtle)]"
            style={previewStyle}
            title="Resulting zone colour"
          />
        )}
        <span className="font-mono text-xs text-[var(--color-text-muted)]">{value.toUpperCase()}</span>
        <button
          type="button"
          onClick={onReset}
          className="ml-auto text-[11px] text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text-secondary)]"
        >
          Reset
        </button>
      </div>
      <p className="text-[11px] text-[var(--color-text-faint)]">{hint}</p>
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
    </div>
  );
}

// ── Theme toggle ──────────────────────────────────────────────────────────────

function ThemeToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const options: { label: string; value: string }[] = [
    { label: "Dark", value: "dark" },
    { label: "Light", value: "light" },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Theme
      </label>
      <div className="inline-flex rounded-lg border border-[var(--color-border-subtle)] overflow-hidden">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
              value === opt.value
                ? "bg-[var(--color-accent,#4f7cf0)] text-white"
                : "bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-[var(--color-text-faint)]">Choose the app colour scheme.</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileClient({
  user,
  initialPrefs,
}: {
  user: CurrentUser;
  initialPrefs: UserPrefs | null;
}) {
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

  // Appearance preferences
  const [accentColor, setAccentColor] = useState(initialPrefs?.accentColor ?? DEFAULT_ACCENT);
  const [amColor, setAmColor] = useState(initialPrefs?.amColor ?? DEFAULT_AM_HUE);
  const [pmColor, setPmColor] = useState(initialPrefs?.pmColor ?? DEFAULT_PM_HUE);
  const [uiScale, setUiScale] = useState(initialPrefs?.uiScale ?? DEFAULT_SCALE);
  const [theme, setTheme] = useState(initialPrefs?.theme ?? "dark");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Live-preview appearance changes immediately
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--color-accent", accentColor);
    root.style.setProperty("--am-hue", amColor);
    root.style.setProperty("--pm-hue", pmColor);
    root.style.setProperty("--ui-scale", String(uiScale));
    root.setAttribute("data-theme", theme);
  }, [accentColor, amColor, pmColor, uiScale, theme]);

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

      await saveUserPreferences({
        accentColor: accentColor !== DEFAULT_ACCENT ? accentColor : null,
        amColor: amColor !== DEFAULT_AM_HUE ? amColor : null,
        pmColor: pmColor !== DEFAULT_PM_HUE ? pmColor : null,
        uiScale: uiScale !== DEFAULT_SCALE ? uiScale : null,
        theme: theme !== "dark" ? theme : null,
      });

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
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </label>
      {node}
    </div>
  );

  const scalePercent = Math.round(uiScale * 100);

  return (
    <div className="flex h-dvh bg-[var(--color-bg-page)] text-[var(--color-text-primary)]">
      <Sidebar mobileOpen={navSidebarOpen} onMobileClose={() => setNavSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-h-0 min-w-0 lg:pl-14">

      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center gap-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-6 py-4">
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
        <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">Account</h1>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
      <div className="mx-auto max-w-lg px-6 py-8">

        {/* Error / success banners */}
        {error && (
          <div className="mb-6 rounded-lg border border-[var(--color-danger-text)]/30 bg-[var(--color-danger-bg)] px-4 py-3 text-xs text-[var(--color-danger-text)]">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-6 rounded-lg border border-[var(--color-status-active-txt)]/30 bg-[var(--color-status-active-bg)] px-4 py-3 text-xs text-[var(--color-status-active-txt)]">
            {successMsg}
          </div>
        )}

        {/* Profile card */}
        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">

          {/* Section: Identity */}
          <div className="flex flex-col gap-5 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Profile</p>

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
                    ROLE_STYLES[user.role] ?? "bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]"
                  }`}
                >
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
                <span className="text-[11px] text-[var(--color-text-faint)]">Managed by admins</span>
              </div>,
            )}
          </div>

          <div className="border-t border-[var(--color-border-subtle)]" />

          {/* Section: Password */}
          <div className="flex flex-col gap-5 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Change password</p>
            <p className="text-xs text-[var(--color-text-muted)]">Leave blank to keep your current password. Enter your current password to confirm any change.</p>

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
              <p className="text-[11px] text-[var(--color-danger-text)]">Password must be at least 8 characters.</p>
            )}
            {currentPasswordRequired && (
              <p className="text-[11px] text-[var(--color-danger-text)]">Current password is required to set a new password.</p>
            )}
            {passwordMismatch && (
              <p className="text-[11px] text-[var(--color-danger-text)]">Passwords do not match.</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-6 py-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="rounded-lg bg-[var(--color-accent,#4f7cf0)] px-5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        {/* Appearance card */}
        <div className="mt-6 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
          <div className="flex flex-col gap-5 px-6 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Appearance</p>

            <ThemeToggle value={theme} onChange={setTheme} />

            <ColorField
              label="Accent colour"
              hint="Used for active states, buttons, and highlights across the app."
              value={accentColor}
              onChange={setAccentColor}
              onReset={() => setAccentColor(DEFAULT_ACCENT)}
            />

            <ColorField
              label="AM zone hue"
              hint="Pick a hue — the board renders a tint of it for AM (pre-lunch) zones."
              value={amColor}
              onChange={setAmColor}
              onReset={() => setAmColor(DEFAULT_AM_HUE)}
              previewStyle={{ backgroundColor: `color-mix(in srgb, ${amColor} 20%, ${theme === "light" ? "white" : "black"})` }}
            />

            <ColorField
              label="PM zone hue"
              hint="Pick a hue — the board renders a tint of it for PM (after-lunch) zones."
              value={pmColor}
              onChange={setPmColor}
              onReset={() => setPmColor(DEFAULT_PM_HUE)}
              previewStyle={{ backgroundColor: `color-mix(in srgb, ${pmColor} 20%, ${theme === "light" ? "white" : "black"})` }}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Text &amp; element size
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.05}
                  value={uiScale}
                  onChange={(e) => setUiScale(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--color-accent,#4f7cf0)]"
                />
                <span className="w-10 text-right font-mono text-xs text-[var(--color-text-secondary)]">{scalePercent}%</span>
                <button
                  type="button"
                  onClick={() => setUiScale(DEFAULT_SCALE)}
                  className="text-[11px] text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text-secondary)]"
                >
                  Reset
                </button>
              </div>
              <p className="text-[11px] text-[var(--color-text-faint)]">Scales text and element sizes globally. Range: 80% – 120%.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-6 py-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="rounded-lg bg-[var(--color-accent,#4f7cf0)] px-5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90"
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
