import assert from "node:assert/strict";

import {
  buildExportData,
  resolveWeeksForRange,
  renderEmployeeDrivenCsv,
  renderSiteDrivenCsv,
  type ExportDb,
  type WeekOption,
  type CsvLabels,
} from "../src/server/services/export.ts";

const run = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

const LABELS: CsvLabels = {
  weekPrefix: "Week",
  sitePrefix: "Site",
  employee: "Employee",
  sick: "Sick",
  vacation: "Vacation",
  total: "Total",
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
};

const week1: WeekOption = {
  id: "week-1",
  param: "2026-04-13",
  startDateIso: "2026-04-13T00:00:00.000Z",
  label: "13 - 17 Apr 26",
  year: 2026,
  month: 4,
};

await run("resolveWeeksForRange filters by mode", () => {
  const weeks: WeekOption[] = [
    week1,
    { ...week1, id: "week-2", param: "2026-04-20", label: "20 - 24 Apr 26" },
    { ...week1, id: "week-3", param: "2026-05-04", label: "4 - 8 May 26", month: 5 },
  ];

  assert.deepEqual(resolveWeeksForRange(weeks, { mode: "week", week: "2026-04-20" }).map((w) => w.id), ["week-2"]);
  assert.deepEqual(
    resolveWeeksForRange(weeks, { mode: "weeks", from: "2026-04-13", to: "2026-04-20" }).map((w) => w.id),
    ["week-1", "week-2"],
  );
  assert.deepEqual(resolveWeeksForRange(weeks, { mode: "month", year: 2026, month: 4 }).map((w) => w.id), ["week-1", "week-2"]);
  assert.deepEqual(resolveWeeksForRange(weeks, { mode: "year", year: 2026 }).map((w) => w.id), ["week-1", "week-2", "week-3"]);
});

await run("buildExportData aggregates hours per site and absences per day", async () => {
  const db: ExportDb = {
    week: { findMany: async () => [{ id: "week-1", startDate: new Date("2026-04-13T00:00:00.000Z") }] },
    assignment: {
      findMany: async () => [
        { employeeId: "alice", projectId: "site-a", weekId: "week-1", date: new Date("2026-04-13T00:00:00.000Z"), dayPart: "full_day" }, // Mon
        { employeeId: "alice", projectId: "site-a", weekId: "week-1", date: new Date("2026-04-14T00:00:00.000Z"), dayPart: "full_day" }, // Tue
        { employeeId: "alice", projectId: "site-a", weekId: "week-1", date: new Date("2026-04-15T00:00:00.000Z"), dayPart: "pre_lunch" }, // Wed AM
        { employeeId: "alice", projectId: "site-b", weekId: "week-1", date: new Date("2026-04-15T00:00:00.000Z"), dayPart: "after_lunch" }, // Wed PM
        { employeeId: "bob", projectId: "site-b", weekId: "week-1", date: new Date("2026-04-16T00:00:00.000Z"), dayPart: "full_day" }, // Thu
        { employeeId: "bob", projectId: "site-b", weekId: "week-1", date: new Date("2026-04-17T00:00:00.000Z"), dayPart: "full_day" }, // Fri
      ],
    },
    availability: {
      findMany: async () => [
        { employeeId: "alice", weekId: "week-1", date: new Date("2026-04-17T00:00:00.000Z"), status: "sick" }, // Fri
        { employeeId: "bob", weekId: "week-1", date: new Date("2026-04-13T00:00:00.000Z"), status: "vacation" }, // Mon
      ],
    },
    employee: { findMany: async () => [{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }] },
    project: { findMany: async () => [{ id: "site-a", name: "Site A" }, { id: "site-b", name: "Site B" }] },
  };

  const sheets = await buildExportData(db, [week1], 8);
  assert.equal(sheets.length, 1);
  const sheet = sheets[0]!;

  assert.deepEqual(sheet.employeeDriven.siteNames, ["Site A", "Site B"]);
  assert.deepEqual(sheet.employeeDriven.rows, [
    { employeeName: "Alice", hoursPerSite: [20, 4], sick: 1, vacation: 0 },
    { employeeName: "Bob", hoursPerSite: [0, 16], sick: 0, vacation: 1 },
  ]);

  assert.equal(sheet.siteDriven.sites.length, 2);
  const siteA = sheet.siteDriven.sites[0]!;
  const siteB = sheet.siteDriven.sites[1]!;
  assert.equal(siteA.siteName, "Site A");
  assert.deepEqual(siteA.rows, [{ employeeName: "Alice", days: [8, 8, 4, 0, 0], total: 20 }]);
  assert.equal(siteB.siteName, "Site B");
  assert.deepEqual(siteB.rows, [
    { employeeName: "Alice", days: [0, 0, 4, 0, 0], total: 4 },
    { employeeName: "Bob", days: [0, 0, 0, 8, 8], total: 16 },
  ]);

  assert.deepEqual(sheet.siteDriven.sickRows, [{ employeeName: "Alice", days: [0, 0, 0, 0, 1], total: 1 }]);
  assert.deepEqual(sheet.siteDriven.vacationRows, [{ employeeName: "Bob", days: [1, 0, 0, 0, 0], total: 1 }]);
});

await run("renderEmployeeDrivenCsv produces one section per week and escapes special characters", () => {
  const sheets = [
    {
      weekLabel: "13 - 17 Apr 26",
      employeeDriven: {
        siteNames: ["Site A"],
        rows: [
          { employeeName: "Alice", hoursPerSite: [20], sick: 1, vacation: 0 },
          { employeeName: 'Doe, "Jane"', hoursPerSite: [0], sick: 0, vacation: 0 },
        ],
      },
      siteDriven: { sites: [], sickRows: [], vacationRows: [] },
    },
  ];

  const csv = renderEmployeeDrivenCsv(sheets, LABELS);
  const lines = csv.split("\n");
  assert.equal(lines[0], "Week: 13 - 17 Apr 26");
  assert.equal(lines[1], "Employee,Site A,Sick,Vacation");
  assert.equal(lines[2], "Alice,20,1,0");
  assert.equal(lines[3], '"Doe, ""Jane""",0,0,0');
});

await run("renderSiteDrivenCsv sections sites then Sick/Vacation blocks per week", () => {
  const sheets = [
    {
      weekLabel: "13 - 17 Apr 26",
      employeeDriven: { siteNames: [], rows: [] },
      siteDriven: {
        sites: [{ siteName: "Site A", rows: [{ employeeName: "Alice", days: [8, 8, 4, 0, 0], total: 20 }] }],
        sickRows: [{ employeeName: "Alice", days: [0, 0, 0, 0, 1], total: 1 }],
        vacationRows: [],
      },
    },
  ];

  const csv = renderSiteDrivenCsv(sheets, LABELS);
  assert.ok(csv.includes("Site: Site A"));
  assert.ok(csv.includes("Alice,8,8,4,0,0,20"));
  assert.ok(csv.includes("Sick\nEmployee,Mon,Tue,Wed,Thu,Fri,Total\nAlice,0,0,0,0,1,1"));
  assert.ok(csv.includes("Vacation\nEmployee,Mon,Tue,Wed,Thu,Fri,Total"));
});
