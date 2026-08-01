// src/components/board/DayHeaderCell.tsx
//
// One sticky day-header cell: the day label + holiday badge, the copy and
// holiday-settings buttons, and the two popovers they open. Rendered once
// per day in BoardClient's desktop day-header row.

import { useTranslations } from "next-intl";
import { DAYS } from "~/lib/constants";
import { CopyIcon, GearIcon } from "~/components/icons";
import type { HolidayType } from "~/types";

type DayHeaderCellProps = {
  day: string;
  dayLabel: (day: string) => string;
  activeDay: string;
  draggingDay: string | null;
  holidayType: HolidayType | null;
  copyPopoverDay: string | null;
  setCopyPopoverDay: (day: string | null) => void;
  holidayPopoverDay: string | null;
  setHolidayPopoverDay: (day: string | null) => void;
  requestCopyDay: (sourceDay: string, targetDay: string) => void;
  applyHoliday: (day: string, type: HolidayType) => void;
  removeHoliday: (day: string) => void;
};

export function DayHeaderCell({
  day,
  dayLabel,
  activeDay,
  draggingDay,
  holidayType,
  copyPopoverDay,
  setCopyPopoverDay,
  holidayPopoverDay,
  setHolidayPopoverDay,
  requestCopyDay,
  applyHoliday,
  removeHoliday,
}: DayHeaderCellProps) {
  const t = useTranslations("Board");
  const pubHoliday = holidayType === "public_holiday";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`relative w-full lg:min-w-max lg:flex-1 rounded-md p-2.5 font-semibold text-sm transition-opacity duration-150 ${
        day === activeDay ? "flex" : "hidden"
      } lg:flex items-center justify-between gap-2 ${
        draggingDay && day === draggingDay
          ? "bg-[var(--color-day-drag-bg)] text-accent/80 ring-1 ring-inset ring-accent/40"
          : draggingDay
          ? "bg-[var(--color-bg-surface)] opacity-30"
          : pubHoliday
          ? "bg-[var(--color-bg-surface)] opacity-50"
          : "bg-[var(--color-bg-surface)]"
      }`}
    >
      {/* Left: day label + optional holiday badge */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1">
        <span className="whitespace-nowrap">{dayLabel(day)}</span>
        {holidayType && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            pubHoliday
              ? "bg-red-500/15 text-red-600 dark:text-red-400"
              : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
          }`}>
            {pubHoliday ? t("publicHoliday") : t("companyHoliday")}
          </span>
        )}
      </div>
      {/* Right: action buttons */}
      {!draggingDay && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {!pubHoliday && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCopyPopoverDay(copyPopoverDay === day ? null : day);
              }}
              title={t("copyAssignmentsTo", { day: dayLabel(day) })}
              className="flex items-center rounded bg-[var(--color-copy-btn)] p-1.5 text-[var(--color-copy-btn-text)] transition-colors hover:bg-[var(--color-copy-btn-hover)] hover:text-[var(--color-text-primary)]"
            >
              <CopyIcon size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setHolidayPopoverDay(holidayPopoverDay === day ? null : day);
            }}
            title={t("holidaySettings")}
            className={`flex items-center rounded p-1.5 transition-colors ${
              holidayType
                ? "text-amber-500 hover:bg-amber-500/10"
                : "bg-[var(--color-copy-btn)] text-[var(--color-copy-btn-text)] hover:bg-[var(--color-copy-btn-hover)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <GearIcon size={14} />
          </button>
        </div>
      )}
      {copyPopoverDay === day && (
        <div className="absolute top-full left-0 z-50 mt-1 min-w-[140px] rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] p-2 shadow-xl">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t("copyFrom")}
          </div>
          {DAYS.filter((d) => d !== day).map((sourceDay) => (
            <button
              key={sourceDay}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                requestCopyDay(sourceDay, day);
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              {dayLabel(sourceDay)}
            </button>
          ))}
        </div>
      )}
      {holidayPopoverDay === day && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-[200px] rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] p-2 shadow-xl">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t("holidaySettings")}
          </div>
          {!holidayType ? (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setHolidayPopoverDay(null); applyHoliday(day, "public_holiday"); }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                {t("setPublicHoliday")}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setHolidayPopoverDay(null); applyHoliday(day, "company_holiday"); }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                {t("setCompanyHoliday")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setHolidayPopoverDay(null); removeHoliday(day); }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
            >
              {t("clearHoliday")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
