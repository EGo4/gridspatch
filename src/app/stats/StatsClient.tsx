"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "~/components/Sidebar";
import type {
  EmployeeStat,
  ManagerStat,
  SiteStat,
  SitePoint,
  WeekOption,
  WeekPoint,
} from "~/server/services/statistics";

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; bgVar: string; txtVar: string }> = {
  planned:  { label: "Planned",  bgVar: "--color-status-planned-bg",  txtVar: "--color-status-planned-txt" },
  active:   { label: "Active",   bgVar: "--color-status-active-bg",   txtVar: "--color-status-active-txt" },
  on_hold:  { label: "On hold",  bgVar: "--color-status-hold-bg",     txtVar: "--color-status-hold-txt" },
  done:     { label: "Done",     bgVar: "--color-status-done-bg",     txtVar: "--color-status-done-txt" },
  inactive: { label: "Inactive", bgVar: "--color-status-inactive-bg", txtVar: "--color-status-inactive-txt" },
};

/** "2025-04-14" → "14 Apr" */
const shortWeekLabel = (weekParam: string): string => {
  const [y, m, d] = weekParam.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const day   = date.getUTCDate();
  const month = date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${month}`;
};

const niceMax = (v: number): number => {
  if (v <= 0) return 1;
  if (v <= 1) return 1;
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  return Math.ceil(v / 5) * 5;
};

// ── Chart components ───────────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/**
 * Vertical bar chart for weekly employee-days.
 */
function VertBarChart({ points, title }: { points: WeekPoint[]; title: string }) {
  if (points.length === 0) {
    return <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">No data.</p>;
  }

  const max = niceMax(Math.max(...points.map((p) => p.employeeDays)));
  const ticks = [0, max * 0.5, max];

  return (
    <div>
      <p className="mb-3 text-[11px] font-medium text-[var(--color-text-muted)]">{title}</p>
      <div className="flex gap-2">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between pb-6 text-right">
          {[...ticks].reverse().map((t) => (
            <span key={t} className="text-[9px] tabular-nums leading-none text-[var(--color-text-faint)]">
              {t % 1 === 0 ? t : t.toFixed(1)}
            </span>
          ))}
        </div>

        {/* Bars + X labels */}
        <div className="flex flex-1 flex-col gap-1 min-w-0">
          {/* Bar area */}
          <div className="flex items-end gap-0.5 h-20">
            {points.map((p) => (
              <div key={p.weekParam} className="flex flex-1 flex-col items-center justify-end min-w-0 h-full">
                {p.employeeDays > 0 && (
                  <span className="text-[8px] tabular-nums leading-none text-[var(--color-text-muted)] mb-0.5">
                    {p.employeeDays}
                  </span>
                )}
                <div
                  className="w-full rounded-t bg-accent min-h-[2px]"
                  style={{ height: `${(p.employeeDays / max) * 100}%` }}
                />
              </div>
            ))}
          </div>

          {/* X labels */}
          <div className="flex gap-0.5">
            {points.map((p) => (
              <div key={p.weekParam} className="flex-1 min-w-0 text-center">
                <span className="block truncate text-[8px] leading-none text-[var(--color-text-faint)]">
                  {shortWeekLabel(p.weekParam)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal bar chart for employee days-per-site.
 */
function HBarChart({ points, title }: { points: SitePoint[]; title: string }) {
  if (points.length === 0) {
    return <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">No data.</p>;
  }

  const max = Math.max(...points.map((p) => p.days), 0.1);

  return (
    <div>
      <p className="mb-3 text-[11px] font-medium text-[var(--color-text-muted)]">{title}</p>
      <div className="flex flex-col gap-2">
        {points.map((p) => (
          <div key={p.projectId} className="flex items-center gap-3 min-w-0">
            <span
              className="w-32 shrink-0 truncate text-right text-[11px] text-[var(--color-text-secondary)]"
              title={p.projectName}
            >
              {p.projectName}
            </span>
            <div className="flex-1 h-5 rounded overflow-hidden bg-[var(--color-bg-raised)]">
              <div
                className="h-full rounded bg-accent transition-all"
                style={{ width: `${(p.days / max) * 100}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">
              {p.days}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Expand panel wrapper ───────────────────────────────────────────────────────

function ExpandPanel({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-6 py-5"
      >
        {children}
      </td>
    </tr>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-[var(--color-text-muted)]">
      {message}
    </div>
  );
}

// ── Tables ─────────────────────────────────────────────────────────────────────

function EmployeesTable({
  stats,
  siteData,
}: {
  stats: EmployeeStat[];
  siteData: Record<string, SitePoint[]>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (stats.length === 0) return <EmptyState message="No employee assignments in this period." />;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border-subtle)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
            <th className="w-8 px-3 py-3" aria-label="Expand" />
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Employee</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Days Assigned</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Sick Days</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Vacation Days</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border-subtle)]">
          {stats.map((s) => {
            const isOpen = expandedId === s.employeeId;
            return (
              <React.Fragment key={s.employeeId}>
                <tr
                  className="cursor-pointer transition-colors hover:bg-[var(--color-bg-surface)]"
                  onClick={() => setExpandedId(isOpen ? null : s.employeeId)}
                >
                  <td className="px-3 py-3 text-[var(--color-text-muted)]">
                    <ChevronIcon open={isOpen} />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-primary)]">{s.employeeName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-primary)]">{s.totalDays}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-secondary)]">
                    {s.sickDays > 0
                      ? <span className="text-[var(--color-status-inactive-txt)]">{s.sickDays}</span>
                      : <span className="text-[var(--color-text-faint)]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-secondary)]">
                    {s.vacationDays > 0
                      ? <span className="text-[var(--color-status-hold-txt)]">{s.vacationDays}</span>
                      : <span className="text-[var(--color-text-faint)]">—</span>}
                  </td>
                </tr>
                {isOpen && (
                  <ExpandPanel colSpan={5}>
                    <HBarChart
                      points={siteData[s.employeeId] ?? []}
                      title={`${s.employeeName} — days per site`}
                    />
                  </ExpandPanel>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SitesTable({
  stats,
  weeklyData,
}: {
  stats: SiteStat[];
  weeklyData: Record<string, WeekPoint[]>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (stats.length === 0) return <EmptyState message="No site assignments in this period." />;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border-subtle)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
            <th className="w-8 px-3 py-3" aria-label="Expand" />
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Site</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Manager</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Status</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Employee-Days</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Weeks Staffed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border-subtle)]">
          {stats.map((s) => {
            const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.planned!;
            const isOpen = expandedId === s.projectId;
            return (
              <React.Fragment key={s.projectId}>
                <tr
                  className="cursor-pointer transition-colors hover:bg-[var(--color-bg-surface)]"
                  onClick={() => setExpandedId(isOpen ? null : s.projectId)}
                >
                  <td className="px-3 py-3 text-[var(--color-text-muted)]">
                    <ChevronIcon open={isOpen} />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-primary)]">{s.projectName}</td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {s.managerName ?? <span className="text-[var(--color-text-faint)]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: `var(${badge.bgVar})`, color: `var(${badge.txtVar})` }}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-primary)]">{s.totalEmployeeDays}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-secondary)]">{s.weeksCovered}</td>
                </tr>
                {isOpen && (
                  <ExpandPanel colSpan={6}>
                    <VertBarChart
                      points={weeklyData[s.projectId] ?? []}
                      title={`${s.projectName} — employee-days per week`}
                    />
                  </ExpandPanel>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ManagersTable({
  stats,
  weeklyData,
}: {
  stats: ManagerStat[];
  weeklyData: Record<string, WeekPoint[]>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (stats.length === 0) return <EmptyState message="No manager data in this period." />;

  const rowKey = (s: ManagerStat, i: number) => s.managerId ?? `__none_${i}`;
  const dataKey = (s: ManagerStat) => s.managerId ?? "__none__";

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border-subtle)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
            <th className="w-8 px-3 py-3" aria-label="Expand" />
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Manager</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Active Sites</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Total Employee-Days</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border-subtle)]">
          {stats.map((s, i) => {
            const key = rowKey(s, i);
            const isOpen = expandedId === key;
            return (
              <React.Fragment key={key}>
                <tr
                  className="cursor-pointer transition-colors hover:bg-[var(--color-bg-surface)]"
                  onClick={() => setExpandedId(isOpen ? null : key)}
                >
                  <td className="px-3 py-3 text-[var(--color-text-muted)]">
                    <ChevronIcon open={isOpen} />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-primary)]">{s.managerName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-secondary)]">{s.siteCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-primary)]">{s.totalEmployeeDays}</td>
                </tr>
                {isOpen && (
                  <ExpandPanel colSpan={4}>
                    <VertBarChart
                      points={weeklyData[dataKey(s)] ?? []}
                      title={`${s.managerName} — employee-days per week`}
                    />
                  </ExpandPanel>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = "employees" | "sites" | "managers";

export function StatsClient({
  employeeStats,
  siteStats,
  managerStats,
  allWeeks,
  fromParam,
  toParam,
  siteWeeklyData,
  employeeSiteData,
  managerWeeklyData,
}: {
  employeeStats: EmployeeStat[];
  siteStats: SiteStat[];
  managerStats: ManagerStat[];
  allWeeks: WeekOption[];
  fromParam: string;
  toParam: string;
  siteWeeklyData: Record<string, WeekPoint[]>;
  employeeSiteData: Record<string, SitePoint[]>;
  managerWeeklyData: Record<string, WeekPoint[]>;
}) {
  const router = useRouter();
  const [navSidebarOpen, setNavSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("employees");

  const handleRangeChange = (field: "from" | "to", value: string) => {
    const params = new URLSearchParams();
    if (field === "from") {
      params.set("from", value);
      params.set("to", value > toParam ? value : toParam);
    } else {
      params.set("from", value < fromParam ? value : fromParam);
      params.set("to", value);
    }
    router.push(`/stats?${params.toString()}`);
  };

  const toWeeks = allWeeks.filter((w) => w.param >= fromParam);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "employees", label: "Employees", count: employeeStats.length },
    { id: "sites",     label: "Sites",     count: siteStats.length },
    { id: "managers",  label: "Managers",  count: managerStats.length },
  ];

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

          <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">Statistics</h1>

          {allWeeks.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">From</span>
              <select
                aria-label="From week"
                value={fromParam}
                onChange={(e) => handleRangeChange("from", e.target.value)}
                className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)]"
              >
                {allWeeks.map((w) => (
                  <option key={w.param} value={w.param}>{w.label}</option>
                ))}
              </select>
              <span className="text-xs text-[var(--color-text-muted)]">To</span>
              <select
                aria-label="To week"
                value={toParam}
                onChange={(e) => handleRangeChange("to", e.target.value)}
                className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-strong)]"
              >
                {toWeeks.map((w) => (
                  <option key={w.param} value={w.param}>{w.label}</option>
                ))}
              </select>
            </div>
          )}
        </header>

        {/* Tabs */}
        <div className="flex flex-shrink-0 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-page)] px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-medium transition-colors -mb-px ${
                activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                activeTab === tab.id
                  ? "bg-[var(--color-nav-active-bg)] text-accent"
                  : "bg-[var(--color-bg-surface)] text-[var(--color-text-muted)]"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {allWeeks.length === 0 ? (
            <EmptyState message="No data yet. Navigate to some weeks on the board first." />
          ) : activeTab === "employees" ? (
            <EmployeesTable stats={employeeStats} siteData={employeeSiteData} />
          ) : activeTab === "sites" ? (
            <SitesTable stats={siteStats} weeklyData={siteWeeklyData} />
          ) : (
            <ManagersTable stats={managerStats} weeklyData={managerWeeklyData} />
          )}
        </main>
      </div>
    </div>
  );
}
