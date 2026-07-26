"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sidebar } from "~/components/Sidebar";
import { updateCompanySettings } from "~/server/actions/settings";

const inputCls =
  "w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] outline-none focus:border-[var(--color-accent)] transition-colors";

export function SettingsClient({ hoursPerDay }: { hoursPerDay: number }) {
  const router = useRouter();
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const [navSidebarOpen, setNavSidebarOpen] = useState(false);

  const [value, setValue] = useState(String(hoursPerDay));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const parsed = Number(value);
  const canSave = Number.isFinite(parsed) && parsed > 0;

  const handleSave = async () => {
    setError(null);
    setSuccessMsg(null);
    setSaving(true);
    try {
      await updateCompanySettings(parsed);
      setSuccessMsg(t("saved"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-dvh bg-[var(--color-bg-page)] text-[var(--color-text-primary)]">
      <Sidebar mobileOpen={navSidebarOpen} onMobileClose={() => setNavSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-h-0 min-w-0 lg:pl-14">

        <header className="flex flex-shrink-0 items-center gap-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-6 py-4">
          <button
            type="button"
            onClick={() => setNavSidebarOpen(true)}
            title={tCommon("openMenu")}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)] lg:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-lg px-6 py-8">

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

            <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
              <div className="flex flex-col gap-5 px-6 py-6">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{t("sectionCompany")}</p>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    {t("hoursPerDayLabel")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className={inputCls}
                  />
                  <p className="text-[11px] text-[var(--color-text-faint)]">{t("hoursPerDayHint")}</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-6 py-4">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || saving}
                  className="rounded-lg bg-[var(--color-accent,#4f7cf0)] px-5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90"
                >
                  {saving ? tCommon("saving") : tCommon("saveChanges")}
                </button>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
