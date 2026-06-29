"use client";

import React, { useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sidebar } from "~/components/Sidebar";
import type { AuditRow } from "./page";
import type { Prisma } from "@prisma/client";

const ACTION_COLORS: Record<string, string> = {
  create:     "bg-green-500/15 text-green-400 border border-green-500/30",
  createMany: "bg-green-500/15 text-green-400 border border-green-500/30",
  update:     "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  updateMany: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  upsert:     "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  delete:     "bg-red-500/15 text-red-400 border border-red-500/30",
  deleteMany: "bg-red-500/15 text-red-400 border border-red-500/30",
};

const ALL_ACTIONS = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];

type Filters = {
  model: string;
  action: string;
  from: string;
  to: string;
  page: number;
};

type Props = {
  logs: AuditRow[];
  total: number;
  models: string[];
  filters: Filters;
  pageSize: number;
};

function CopyButton({ text, label, copyLabel, copiedLabel }: { text: string; label: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="rounded px-1.5 py-0.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
      title={label}
    >
      {copied ? copiedLabel : copyLabel}
    </button>
  );
}

function PayloadCell({ payload, t }: { payload: Prisma.JsonValue; t: ReturnType<typeof useTranslations<"Audit">> }) {
  const [expanded, setExpanded] = useState(false);
  const json = JSON.stringify(payload, null, 2);
  const preview = JSON.stringify(payload);
  const truncated = preview.length > 80 ? preview.slice(0, 80) + "…" : preview;

  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">
        {expanded ? (
          <pre className="whitespace-pre-wrap break-all font-mono text-xs text-[var(--color-text-secondary)]">
            {json}
          </pre>
        ) : (
          <span className="font-mono text-xs text-[var(--color-text-muted)]">{truncated}</span>
        )}
      </div>
      <div className="flex flex-shrink-0 gap-0.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded px-1.5 py-0.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
        >
          {expanded ? t("collapse") : t("expand")}
        </button>
        <CopyButton text={json} label={t("copyPayload")} copyLabel={t("copy")} copiedLabel={t("copied")} />
      </div>
    </div>
  );
}

function formatTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("sv-SE", { hour12: false }).replace("T", " ");
}

export function AuditClient({ logs, total, models, filters, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("Audit");
  const [navOpen, setNavOpen] = useState(false);

  const pushFilters = useCallback(
    (updates: Partial<Filters>) => {
      const next = { ...filters, page: 0, ...updates };
      const params = new URLSearchParams();
      if (next.model) params.set("model", next.model);
      if (next.action) params.set("action", next.action);
      if (next.from)   params.set("from", next.from);
      if (next.to)     params.set("to", next.to);
      if (next.page)   params.set("page", String(next.page));
      router.push(`${pathname}?${params.toString()}`);
    },
    [filters, pathname, router],
  );

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex min-h-screen bg-[var(--color-bg-base)]">
      <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />

      <main className="flex-1 overflow-auto lg:ml-14">
        {/* Mobile header */}
        <div className="flex h-14 items-center gap-3 border-b border-[var(--color-border-subtle)] px-4 lg:hidden">
          <button
            type="button"
            aria-label={t("openMenu")}
            onClick={() => setNavOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">{t("title")}</span>
        </div>

        <div className="p-6">
          <h1 className="mb-5 text-lg font-semibold text-[var(--color-text-primary)]">{t("title")}</h1>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-2">
            <select
              aria-label={t("filterByModel")}
              value={filters.model}
              onChange={(e) => pushFilters({ model: e.target.value })}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">{t("allModels")}</option>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <select
              aria-label={t("filterByAction")}
              value={filters.action}
              onChange={(e) => pushFilters({ action: e.target.value })}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">{t("allActions")}</option>
              {ALL_ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <input
              type="date"
              aria-label={t("filterFrom")}
              value={filters.from}
              onChange={(e) => pushFilters({ from: e.target.value })}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              type="date"
              aria-label={t("filterTo")}
              value={filters.to}
              onChange={(e) => pushFilters({ to: e.target.value })}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-accent"
            />

            {(filters.model || filters.action || filters.from || filters.to) && (
              <button
                type="button"
                onClick={() => pushFilters({ model: "", action: "", from: "", to: "" })}
                className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
              >
                {t("clear")}
              </button>
            )}

            <span className="ml-auto self-center text-sm text-[var(--color-text-muted)]">
              {t("entries", { count: total.toLocaleString() })}
            </span>
          </div>

          {/* Table */}
          <div className="max-h-[calc(100vh-220px)] overflow-auto rounded-xl border border-[var(--color-border-subtle)]">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">{t("colTimestamp")}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">{t("colAction")}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">{t("colModel")}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">{t("colPath")}</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[var(--color-text-muted)]">{t("colPayload")}</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[var(--color-text-muted)]"><span className="sr-only">{t("colActions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                      {t("noEntries")}
                    </td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[var(--color-bg-surface)]/50"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">
                      {formatTs(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${ACTION_COLORS[log.action] ?? "bg-[var(--color-bg-surface)] text-[var(--color-text-muted)]"}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-text-primary)]">
                      {log.model}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <span
                          className="max-w-[200px] truncate font-mono text-xs text-[var(--color-text-muted)]"
                          title={log.path ?? ""}
                        >
                          {log.path ?? <span className="italic">—</span>}
                        </span>
                        {log.path && (
                          <CopyButton
                            text={log.path}
                            label={t("copyPath")}
                            copyLabel={t("copy")}
                            copiedLabel={t("copied")}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <PayloadCell payload={log.payload} t={t} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CopyButton
                        text={JSON.stringify({ ...log }, null, 2)}
                        label={t("copyRow")}
                        copyLabel={t("copy")}
                        copiedLabel={t("copied")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">
                {t("page", { current: filters.page + 1, total: totalPages })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={filters.page === 0}
                  onClick={() => pushFilters({ page: filters.page - 1 })}
                  className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-40"
                >
                  {t("previous")}
                </button>
                <button
                  type="button"
                  disabled={filters.page >= totalPages - 1}
                  onClick={() => pushFilters({ page: filters.page + 1 })}
                  className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-40"
                >
                  {t("next")}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
