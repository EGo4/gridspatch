// src/components/board/modals/SiteCopyDialog.tsx
//
// Site-selective day copy, variant 1: opens after picking a source day from
// the day-header copy popover, instead of copying immediately. Lists every
// site currently visible on the board (already filtered by the active
// manager/year filter — see visibleProjects in BoardClient), all checked by
// default; the planner can deselect individual sites or all of them before
// confirming. Replaces the old unconditional overwrite-confirm modal.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Project } from "~/types";

type SiteCopyDialogProps = {
  dialog: { sourceDay: string; targetDay: string } | null;
  /** Skipped-employee count from the last confirm; null while still selecting. */
  result: number | null;
  projects: Project[];
  dayLabel: (day: string) => string;
  projectDayCount: (projectId: string, day: string) => number;
  onConfirm: (projectIds: string[]) => void;
  onClose: () => void;
};

export function SiteCopyDialog({ dialog, result, projects, dayLabel, projectDayCount, onConfirm, onClose }: SiteCopyDialogProps) {
  const t = useTranslations("Board");
  const tCommon = useTranslations("Common");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset to "everything checked" whenever a fresh copy is requested.
  useEffect(() => {
    if (dialog) setSelected(new Set(projects.map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-seed when a *new* dialog opens, not on every projects/selection change
  }, [dialog]);

  if (!dialog) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] max-h-[min(85vh,560px)] -translate-x-1/2 -translate-y-1/2 flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-5 py-4 flex-shrink-0">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("siteCopyTitle")}</h3>
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

        {result !== null ? (
          <div className="flex flex-col gap-3 px-5 py-6">
            <p className="text-sm text-[var(--color-text-primary)]">{t("siteCopyResultDone")}</p>
            {result > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] px-3 py-2.5 text-xs text-[var(--color-warn-text)]">
                <svg className="mt-0.5 flex-shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {t("siteCopySkipped", { count: result })}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="self-end rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90"
            >
              {t("siteCopyDone")}
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 pt-3 pb-2 flex-shrink-0">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t("siteCopyBody", { from: dayLabel(dialog.sourceDay), to: dayLabel(dialog.targetDay) })}
              </p>
            </div>

            <div className="px-5 pb-2 flex items-center justify-between flex-shrink-0">
              <div className="flex gap-3 text-xs font-medium text-accent">
                <button type="button" onClick={() => setSelected(new Set(projects.map((p) => p.id)))} className="hover:opacity-80">
                  {t("siteCopySelectAll")}
                </button>
                <button type="button" onClick={() => setSelected(new Set())} className="hover:opacity-80">
                  {t("siteCopyDeselectAll")}
                </button>
              </div>
              <div className="flex gap-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                <span>{t("siteCopyColSource", { day: dayLabel(dialog.sourceDay) })}</span>
                <span>{t("siteCopyColTarget", { day: dayLabel(dialog.targetDay) })}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
              {projects.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">{t("siteCopyNoSites")}</p>
              ) : (
                <div className="flex flex-col divide-y divide-[var(--color-border-subtle)]">
                  {projects.map((project) => (
                    <label key={project.id} className="flex items-center gap-3 py-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.has(project.id)}
                        onChange={() => toggle(project.id)}
                        className="h-4 w-4 flex-shrink-0 accent-[var(--color-accent)]"
                      />
                      <span className="flex-1 min-w-0 truncate text-sm text-[var(--color-text-primary)]">{project.name}</span>
                      <span className="w-6 flex-shrink-0 text-right text-xs tabular-nums text-[var(--color-text-secondary)]">
                        {projectDayCount(project.id, dialog.sourceDay)}
                      </span>
                      <span className="w-6 flex-shrink-0 text-right text-xs tabular-nums text-[var(--color-text-secondary)]">
                        {projectDayCount(project.id, dialog.targetDay)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => onConfirm(Array.from(selected))}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-40 hover:opacity-90"
              >
                {t("copy")}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
