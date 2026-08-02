// src/components/board/modals/SiteDayCopyPopover.tsx
//
// Site-selective day copy, variant 2: the small copy control on a site's own
// day cell. Lists the week's other weekdays with how many assignments this
// one site has on each; picking a day fills this cell from that day. Days
// with no assignments are still listed (marked empty), not hidden. A
// non-empty target asks for confirmation inline before overwriting.

import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { DAYS } from "~/lib/constants";
import type { SiteDayCopyTarget } from "../types";

type SiteDayCopyPopoverProps = {
  target: SiteDayCopyTarget | null;
  confirm: { projectId: string; sourceDay: string; targetDay: string } | null;
  /** Skipped-employee count from the last copy — only shown when > 0. */
  result: number | null;
  dayLabel: (day: string) => string;
  projectDayCount: (projectId: string, day: string) => number;
  onPickDay: (projectId: string, sourceDay: string, targetDay: string) => void;
  onConfirm: (projectId: string, sourceDay: string, targetDay: string) => void;
  onCancelConfirm: () => void;
  onCloseResult: () => void;
};

export function SiteDayCopyPopover({
  target,
  confirm,
  result,
  dayLabel,
  projectDayCount,
  onPickDay,
  onConfirm,
  onCancelConfirm,
  onCloseResult,
}: SiteDayCopyPopoverProps) {
  const t = useTranslations("Board");
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!ref.current || !target) return;
    const el = ref.current;
    el.style.setProperty("--picker-left", `${Math.min(target.left, window.innerWidth - 176)}px`);
    el.style.setProperty("--picker-top", `${target.top + 4}px`);
  }, [target]);

  if (!target) return null;

  const activeConfirm = confirm?.projectId === target.projectId && confirm.targetDay === target.day ? confirm : null;

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="site-picker z-[100] min-w-[160px] overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] py-1 shadow-2xl"
      style={{ position: "fixed", left: "var(--picker-left)", top: "var(--picker-top)" }}
    >
      {result !== null ? (
        <div className="px-3 py-2.5 flex flex-col gap-2.5">
          <div className="flex items-start gap-2 text-xs text-[var(--color-warn-text)]">
            <svg className="mt-0.5 flex-shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {t("siteCopySkipped", { count: result })}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCloseResult(); }}
            className="self-end rounded bg-accent px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:opacity-90"
          >
            {t("siteCopyDone")}
          </button>
        </div>
      ) : activeConfirm ? (
        <div className="px-3 py-2.5 flex flex-col gap-2.5">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {t("siteDayCopyOverwriteBody", { day: dayLabel(activeConfirm.targetDay) })}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancelConfirm(); }}
              className="rounded px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onConfirm(activeConfirm.projectId, activeConfirm.sourceDay, activeConfirm.targetDay); }}
              className="rounded bg-accent px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:opacity-90"
            >
              {t("copy")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t("copyFrom")}
          </div>
          {DAYS.filter((d) => d !== target.day).map((sourceDay) => {
            const count = projectDayCount(target.projectId, sourceDay);
            return (
              <button
                key={sourceDay}
                type="button"
                onClick={(e) => { e.stopPropagation(); onPickDay(target.projectId, sourceDay, target.day); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                <span className="truncate">{dayLabel(sourceDay)}</span>
                <span className="flex-shrink-0 tabular-nums text-[var(--color-text-muted)]">
                  {count > 0 ? count : t("siteDayCopyEmpty")}
                </span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
