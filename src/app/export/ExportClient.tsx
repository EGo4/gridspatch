"use client";

import React, { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sidebar } from "~/components/Sidebar";
import type { WeekOption } from "~/server/services/export";

type Mode = "week" | "weeks" | "month" | "year";
type Layout = "employee" | "site";

const selectCls =
  "rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)]";

export function ExportClient({ weeks, hoursPerDay }: { weeks: WeekOption[]; hoursPerDay: number }) {
  const t = useTranslations("Export");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [navSidebarOpen, setNavSidebarOpen] = useState(false);

  const [mode, setMode] = useState<Mode>("week");
  const [layout, setLayout] = useState<Layout>("employee");

  const lastWeek = weeks[weeks.length - 1];
  const firstWeek = weeks[0];

  const [week, setWeek] = useState(lastWeek?.param ?? "");
  const [from, setFrom] = useState(firstWeek?.param ?? "");
  const [to, setTo] = useState(lastWeek?.param ?? "");

  const years = useMemo(
    () => Array.from(new Set(weeks.map((w) => w.year))).sort((a, b) => b - a),
    [weeks],
  );
  const [year, setYear] = useState(years[0] ?? new Date().getUTCFullYear());

  const monthsForYear = useMemo(
    () => Array.from(new Set(weeks.filter((w) => w.year === year).map((w) => w.month))).sort((a, b) => a - b),
    [weeks, year],
  );
  const [month, setMonth] = useState(monthsForYear[monthsForYear.length - 1] ?? 1);

  const monthLabel = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, m - 1, 1)));

  const handleFromChange = (value: string) => {
    setFrom(value);
    if (value > to) setTo(value);
  };
  const handleToChange = (value: string) => {
    setTo(value);
    if (value < from) setFrom(value);
  };
  const handleYearChange = (value: number) => {
    setYear(value);
    const monthsInYear = weeks.filter((w) => w.year === value).map((w) => w.month);
    if (!monthsInYear.includes(month)) {
      setMonth(monthsInYear[monthsInYear.length - 1] ?? 1);
    }
  };

  const toWeeks = weeks.filter((w) => w.param >= from);

  const handleDownload = () => {
    const params = new URLSearchParams();
    params.set("layout", layout);
    params.set("mode", mode);
    if (mode === "week") params.set("week", week);
    else if (mode === "weeks") { params.set("from", from); params.set("to", to); }
    else if (mode === "month") { params.set("year", String(year)); params.set("month", String(month)); }
    else if (mode === "year") { params.set("year", String(year)); }
    window.location.href = `/api/export?${params.toString()}`;
  };

  const modeTabs: { id: Mode; label: string }[] = [
    { id: "week", label: t("modeWeek") },
    { id: "weeks", label: t("modeWeeks") },
    { id: "month", label: t("modeMonth") },
    { id: "year", label: t("modeYear") },
  ];

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
          <div className="mx-auto max-w-2xl px-6 py-8">

            {weeks.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">{t("noWeeksAvailable")}</p>
            ) : (
              <div className="flex flex-col gap-6 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-6 py-6">

                {/* Range mode */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-1 rounded-lg bg-[var(--color-bg-input)] p-1">
                    {modeTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setMode(tab.id)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          mode === tab.id
                            ? "bg-accent text-white"
                            : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {mode === "week" && (
                    <select aria-label={t("modeWeek")} value={week} onChange={(e) => setWeek(e.target.value)} className={selectCls}>
                      {weeks.map((w) => <option key={w.param} value={w.param}>{w.label}</option>)}
                    </select>
                  )}

                  {mode === "weeks" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--color-text-muted)]">{t("from")}</span>
                      <select aria-label={t("from")} value={from} onChange={(e) => handleFromChange(e.target.value)} className={selectCls}>
                        {weeks.map((w) => <option key={w.param} value={w.param}>{w.label}</option>)}
                      </select>
                      <span className="text-xs text-[var(--color-text-muted)]">{t("to")}</span>
                      <select aria-label={t("to")} value={to} onChange={(e) => handleToChange(e.target.value)} className={selectCls}>
                        {toWeeks.map((w) => <option key={w.param} value={w.param}>{w.label}</option>)}
                      </select>
                    </div>
                  )}

                  {mode === "month" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--color-text-muted)]">{t("year")}</span>
                      <select aria-label={t("year")} value={year} onChange={(e) => handleYearChange(Number(e.target.value))} className={selectCls}>
                        {years.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <span className="text-xs text-[var(--color-text-muted)]">{t("month")}</span>
                      <select aria-label={t("month")} value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
                        {monthsForYear.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                      </select>
                    </div>
                  )}

                  {mode === "year" && (
                    <select aria-label={t("year")} value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
                      {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  )}
                </div>

                {/* Layout */}
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{t("layoutTitle")}</span>
                  <div className="flex gap-1 rounded-lg bg-[var(--color-bg-input)] p-1">
                    <button
                      type="button"
                      onClick={() => setLayout("employee")}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        layout === "employee" ? "bg-accent text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      {t("layoutEmployee")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayout("site")}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        layout === "site" ? "bg-accent text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      {t("layoutSite")}
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-[var(--color-text-faint)]">{t("hoursPerDayNote", { hours: hoursPerDay })}</p>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="self-start rounded-lg bg-[var(--color-accent,#4f7cf0)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  {t("download")}
                </button>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
