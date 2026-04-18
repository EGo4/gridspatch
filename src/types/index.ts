// src/types/index.ts

export type DayPart = "full_day" | "pre_lunch" | "after_lunch";

export type Employee = {
  id: string;
  name: string;
  img: string | null;
};

export type ProjectStatus = "active" | "on_hold" | "not_active";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: ProjectStatus;
  constructionManagerId: string | null;
  constructionManagerName: string | null;
};

export type Assignment = {
  employeeId: string;
  projectId: string | null;
  date: Date;
  weekId: string;
  dayPart: DayPart;
};

export type BoardWeek = {
  id: string;
  startDateIso: string;
  endDateIso: string;
  param: string;
  label: string;
  isCurrent: boolean;
};
