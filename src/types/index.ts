// src/types/index.ts

export type Employee = {
  id: string;
  name: string;
  img: string | null;
};

export type Project = {
  id: string;
  name: string;
};

export type Assignment = {
  employeeId: string;
  projectId: string | null;
  date: Date;
  weekId: string;
};

export type BoardWeek = {
  id: string;
  startDateIso: string;
  endDateIso: string;
  param: string;
  label: string;
  isCurrent: boolean;
};
