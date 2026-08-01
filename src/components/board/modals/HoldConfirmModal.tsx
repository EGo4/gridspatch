// src/components/board/modals/HoldConfirmModal.tsx
//
// Warns that putting a site on hold clears its assignments for the week.

import { useTranslations } from "next-intl";

type HoldConfirmModalProps = {
  transition: { projectId: string; assignmentCount: number } | null;
  projectName: string | undefined;
  applying: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function HoldConfirmModal({ transition, projectName, applying, onCancel, onConfirm }: HoldConfirmModalProps) {
  const t = useTranslations("Board");
  const tCommon = useTranslations("Common");

  if (!transition) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onCancel} />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("holdTitle")}</h3>
          <button type="button" title={tCommon("close")} onClick={onCancel}
            className="flex items-center rounded p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t("holdBody", { name: projectName ?? "" })}
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] px-3 py-2.5 text-xs text-[var(--color-warn-text)]">
            <svg className="mt-0.5 flex-shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {t("holdWarn", { count: transition.assignmentCount })}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4">
          <button type="button" onClick={onCancel}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]">
            {t("cancel")}
          </button>
          <button type="button" onClick={onConfirm} disabled={applying}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {applying ? t("applying") : t("putOnHold")}
          </button>
        </div>
      </div>
    </>
  );
}
