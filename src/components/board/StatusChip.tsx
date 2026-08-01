// src/components/board/StatusChip.tsx
//
// The small status pill next to a project's name, plus the transition
// popover it opens. Identical in both the active/planned swimlane and the
// on-hold swimlane in BoardClient — only the trigger's markup around it
// differs — so it lives here once instead of twice.

import { useTranslations } from "next-intl";
import { ALLOWED_TRANSITIONS, getSuperStatus } from "~/types";
import type { Project, ProjectStatus } from "~/types";

const STATUS_CHIP: Record<ProjectStatus, string> = {
  planned:  "bg-[var(--color-status-planned-bg)] text-[var(--color-status-planned-txt)]",
  active:   "bg-[var(--color-status-active-bg)] text-[var(--color-status-active-txt)]",
  on_hold:  "bg-[var(--color-status-hold-bg)] text-[var(--color-status-hold-txt)]",
  done:     "bg-[var(--color-status-done-bg)] text-[var(--color-status-done-txt)]",
  inactive: "bg-[var(--color-status-inactive-bg)] text-[var(--color-status-inactive-txt)]",
};

type StatusChipProps = {
  project: Project;
  status: ProjectStatus;
  isOpen: boolean;
  onToggle: () => void;
  applying: boolean;
  onTransition: (projectId: string, toStatus: ProjectStatus) => void;
};

export function StatusChip({ project, status, isOpen, onToggle, applying, onTransition }: StatusChipProps) {
  const t = useTranslations("Board");
  const tStatus = useTranslations("Status");

  return (
    <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={applying}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-40 ${STATUS_CHIP[status]}`}
      >
        {tStatus(status)}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[130px] overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] py-1 shadow-xl">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t("transitionTo")}
          </div>
          {ALLOWED_TRANSITIONS[status].map((toStatus) => {
            const isCompleting = getSuperStatus(toStatus) === "completed";
            return (
              <button
                key={toStatus}
                type="button"
                onClick={() => onTransition(project.id, toStatus)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_CHIP[toStatus].split(" ")[1] ?? ""}`} />
                {tStatus(toStatus)}
                {isCompleting && <span className="ml-auto text-[var(--color-warn-text)]">⚠</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
