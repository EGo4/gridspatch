import { DAYS, type DayName } from "./constants.ts";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const toUtcDate = (value: Date | string) => {
  const date = typeof value === "string" ? new Date(value) : new Date(value.getTime());

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

export const addUtcDays = (value: Date | string, days: number) =>
  new Date(toUtcDate(value).getTime() + days * DAY_IN_MS);

export const normalizeWeekStart = (value: Date | string) => {
  const date = toUtcDate(value);
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  return addUtcDays(date, diffToMonday);
};

export const getCurrentWeekStart = (today = new Date()) => normalizeWeekStart(today);

export const getWeekEnd = (weekStart: Date | string) => addUtcDays(weekStart, DAYS.length - 1);

export const toDateParam = (value: Date | string) => toUtcDate(value).toISOString().slice(0, 10);

export const toDateIso = (value: Date | string) => `${toDateParam(value)}T00:00:00.000Z`;

export const parseWeekParam = (value?: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getWeekDateMap = (weekStart: Date | string): Record<DayName, string> => {
  const normalized = normalizeWeekStart(weekStart);

  return DAYS.reduce(
    (acc, day, index) => {
      acc[day] = toDateIso(addUtcDays(normalized, index));
      return acc;
    },
    {} as Record<DayName, string>,
  );
};

export const getDayNameFromDate = (
  value: Date | string,
  weekStart: Date | string,
): DayName | null => {
  const targetParam = toDateParam(value);
  const weekDates = getWeekDateMap(weekStart);

  return DAYS.find((day) => toDateParam(weekDates[day]) === targetParam) ?? null;
};

export const formatWeekLabel = (weekStart: Date | string) => {
  const start = normalizeWeekStart(weekStart);
  const end = getWeekEnd(start);

  const dayFmt   = new Intl.DateTimeFormat("en-GB", { day: "numeric",            timeZone: "UTC" });
  const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short",            timeZone: "UTC" });
  const yearFmt  = new Intl.DateTimeFormat("en-GB", { year: "2-digit",           timeZone: "UTC" });

  const startDay   = dayFmt.format(start);
  const endDay     = dayFmt.format(end);
  const endMonth   = monthFmt.format(end);
  const year       = yearFmt.format(end);

  if (start.getUTCMonth() === end.getUTCMonth()) {
    // Same month: "13 - 17 Apr 26"
    return `${startDay} - ${endDay} ${endMonth} ${year}`;
  }
  // Spans two months: "28 Apr - 2 May 26"
  return `${startDay} ${monthFmt.format(start)} - ${endDay} ${endMonth} ${year}`;
};

export const getPreviousWeekParam = (weekStart: Date | string) =>
  toDateParam(addUtcDays(normalizeWeekStart(weekStart), -7));

export const getNextWeekParam = (weekStart: Date | string) =>
  toDateParam(addUtcDays(normalizeWeekStart(weekStart), 7));
