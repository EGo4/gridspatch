// src/components/board/modals/SitePickerPopover.tsx
//
// Fixed-position popover for assigning an employee to a site, anchored to
// the "assign to site" button that opened it. Owns its own ref and the
// layout effect that positions it via CSS custom properties, since nothing
// outside this component needs either.

import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { getProjectIdFromDroppableId } from "../boardIds";
import { AssignSiteIcon } from "~/components/icons";
import type { DayPart, Project } from "~/types";
import type { SitePickerTarget } from "../types";

type SitePickerPopoverProps = {
  sitePickerFor: SitePickerTarget | null;
  /** Already filtered to sites assignable from a picker (excludes on-hold). */
  projects: Project[];
  onAssign: (employeeId: string, day: string, projectId: string, sourceCellId: string, dayPart: DayPart) => void;
};

export function SitePickerPopover({ sitePickerFor, projects, onAssign }: SitePickerPopoverProps) {
  const t = useTranslations("Board");
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!ref.current || !sitePickerFor) return;
    const el = ref.current;
    el.style.setProperty("--picker-left", `${Math.min(sitePickerFor.left, window.innerWidth - 196)}px`);
    el.style.setProperty("--picker-bottom", `${window.innerHeight - sitePickerFor.top + 8}px`);
  }, [sitePickerFor]);

  if (!sitePickerFor) return null;

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="site-picker z-[100] min-w-[180px] overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] py-1 shadow-2xl"
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {t("assignToSite")}
      </div>
      {projects.map((project) => {
        const isCurrent = getProjectIdFromDroppableId(sitePickerFor.sourceCellId) === project.id;
        return (
          <button
            key={project.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAssign(sitePickerFor.employeeId, sitePickerFor.day, project.id, sitePickerFor.sourceCellId, sitePickerFor.dayPart);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <AssignSiteIcon size={12} className="flex-shrink-0 text-[var(--color-text-muted)]" />
            <span className="flex-1 truncate">{project.name}</span>
            {isCurrent && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-accent">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
