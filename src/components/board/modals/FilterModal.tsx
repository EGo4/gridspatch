// src/components/board/modals/FilterModal.tsx
//
// Filters the board's project swimlanes by construction manager and/or a year of activity.

import { useTranslations } from "next-intl";

type Manager = { id: string; name: string };

type FilterModalProps = {
  open: boolean;
  managersWithSites: Manager[];
  pendingManagerId: string | null;
  onSelectManager: (id: string | null) => void;
  years: number[];
  pendingYear: number | null;
  onSelectYear: (year: number | null) => void;
  onApply: () => void;
  onClearAll: () => void;
  onClose: () => void;
};

export function FilterModal({
  open,
  managersWithSites,
  pendingManagerId,
  onSelectManager,
  years,
  pendingYear,
  onSelectYear,
  onApply,
  onClearAll,
  onClose,
}: FilterModalProps) {
  const t = useTranslations("Board");
  const tCommon = useTranslations("Common");

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <div
        className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("filtersTitle")}</h3>
          <button
            type="button"
            onClick={onClose}
            title={tCommon("close")}
            className="flex items-center rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Section: Construction manager */}
        <div className="px-5 py-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t("filterManager")}
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onSelectManager(null)}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                pendingManagerId === null
                  ? "bg-[var(--color-nav-active-bg)] text-accent"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {t("allManagers")}
            </button>
            {managersWithSites.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--color-text-faint)]">{t("noManagers")}</p>
            ) : (
              managersWithSites.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectManager(m.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    pendingManagerId === m.id
                      ? "bg-[var(--color-nav-active-bg)] text-accent"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                  {m.name}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Section: Year */}
        <div className="border-t border-[var(--color-border-subtle)] px-5 py-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {tCommon("yearFilterLabel")}
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onSelectYear(null)}
              className={`rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                pendingYear === null
                  ? "bg-[var(--color-nav-active-bg)] text-accent"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {tCommon("allYears")}
            </button>
            {years.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => onSelectYear(year)}
                className={`rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                  pendingYear === year
                    ? "bg-[var(--color-nav-active-bg)] text-accent"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] px-5 py-4">
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
          >
            {t("clearAll")}
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
          >
            {t("apply")}
          </button>
        </div>
      </div>
    </>
  );
}
