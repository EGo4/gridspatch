import assert from "node:assert/strict";

import { getBoardPageData } from "../src/server/services/board.ts";
import {
  formatWeekLabel,
  getDayNameFromDate,
  getWeekDateMap,
  normalizeWeekStart,
  parseWeekParam,
} from "../src/lib/week.ts";

const run = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

await run("normalizeWeekStart snaps any day to the Monday of that week", () => {
  const normalized = normalizeWeekStart(new Date("2026-04-16T15:30:00.000Z"));

  assert.equal(normalized.toISOString(), "2026-04-13T00:00:00.000Z");
});

await run("getWeekDateMap returns Monday through Friday for the selected week", () => {
  const weekDates = getWeekDateMap("2026-04-13T00:00:00.000Z");

  assert.deepEqual(weekDates, {
    Friday: "2026-04-17T00:00:00.000Z",
    Monday: "2026-04-13T00:00:00.000Z",
    Thursday: "2026-04-16T00:00:00.000Z",
    Tuesday: "2026-04-14T00:00:00.000Z",
    Wednesday: "2026-04-15T00:00:00.000Z",
  });
});

await run("getDayNameFromDate returns null for dates outside the selected week", () => {
  const dayName = getDayNameFromDate("2026-04-20T00:00:00.000Z", "2026-04-13T00:00:00.000Z");

  assert.equal(dayName, null);
});

await run("parseWeekParam accepts date params and formatWeekLabel renders a stable label", () => {
  const parsed = parseWeekParam("2026-04-13");

  assert.ok(parsed);
  assert.equal(formatWeekLabel(parsed), "13 - 17 Apr 26");
});

await run(
  "getBoardPageData creates or selects the requested week and scopes assignments by week",
  async () => {
    const selectedWeek = {
      endDate: new Date("2026-04-17T00:00:00.000Z"),
      id: "week-1",
      isCurrent: false,
      startDate: new Date("2026-04-13T00:00:00.000Z"),
    };

    let upsertArgs:
      | {
        create: { endDate: Date; isCurrent: boolean; startDate: Date };
        update: { endDate: Date };
        where: { startDate: Date };
      }
      | undefined;
    let assignmentWhere: { weekId: string } | undefined;

    const boardData = await getBoardPageData(
      {
        assignment: {
          findMany: async ({ where }) => {
            assignmentWhere = where;
            return [
              {
                date: new Date("2026-04-13T00:00:00.000Z"),
                dayPart: "full_day",
                employeeId: "employee-1",
                id: "assignment-1",
                projectId: "project-1",
                weekId: "week-1",
              },
            ];
          },
        },
        employee: {
          findMany: async () => [
            {
              id: "employee-1",
              img: null,
              name: "Alice",
            },
          ],
        },
        project: {
          findMany: async () => [
            {
              id: "project-1",
              name: "Site A",
              description: null,
              startDate: null,
              endDate: null,
              status: "active",
              constructionManagerId: null,
              constructionManager: null,
            },
          ],
        },
        availability: {
          findMany: async () => [],
        },
        projectWeekStatus: {
          findMany: async () => [],
        },
        week: {
          findMany: async () => [selectedWeek],
          upsert: async (args) => {
            upsertArgs = args;
            return selectedWeek;
          },
        },
      },
      "2026-04-16",
    );

    assert.equal(upsertArgs?.where.startDate.toISOString(), "2026-04-13T00:00:00.000Z");
    assert.equal(upsertArgs?.create.endDate.toISOString(), "2026-04-17T00:00:00.000Z");
    assert.deepEqual(assignmentWhere, { weekId: "week-1" });
    assert.equal(boardData.selectedWeek.param, "2026-04-13");
    assert.equal(boardData.weeks[0]?.label, "13 - 17 Apr 26");
  },
);
