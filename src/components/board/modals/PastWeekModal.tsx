// src/components/board/modals/PastWeekModal.tsx
//
// Confirmation shown before a mutation on an already-passed week is applied.
// See confirmPastEdit() in BoardClient — this is purely the dialog's JSX.

import { useTranslations } from "next-intl";

type PastWeekModalProps = {
  open: boolean;
  onConfirm: () => void;
  onMute: () => void;
  onCancel: () => void;
};

export function PastWeekModal({ open, onConfirm, onMute, onCancel }: PastWeekModalProps) {
  const t = useTranslations("Board");

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--color-warn-border)] bg-[var(--color-bg-overlay)] p-6 shadow-2xl">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--color-warn-text)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {t("pastWeekTitle")}
        </div>
        <p className="mb-5 text-xs text-[var(--color-text-secondary)]">
          {t("pastWeekBody")}
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onConfirm}
            className="w-full rounded-lg bg-[var(--color-warn-text)] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90">
            {t("pastWeekConfirm")}
          </button>
          <button type="button" onClick={onMute}
            className="w-full rounded-lg border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] px-4 py-2 text-xs font-medium text-[var(--color-warn-text)] transition-colors hover:opacity-90">
            {t("pastWeekMute")}
          </button>
          <button type="button" onClick={onCancel}
            className="w-full rounded-lg px-4 py-2 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]">
            {t("cancel")}
          </button>
        </div>
      </div>
    </>
  );
}
