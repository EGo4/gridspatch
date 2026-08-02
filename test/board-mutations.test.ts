import assert from "node:assert/strict";

import {
  updateAssignment,
  splitAssignment,
  mergeAssignment,
  setAvailability,
  clearAvailability,
  copyWeekAssignments,
  copyDayAssignments,
  type BoardMutationDb,
} from "../src/server/services/boardMutations.ts";

const run = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

type Row = Record<string, unknown>;

const valueEquals = (a: unknown, b: unknown): boolean => {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
};

const matchesWhere = (where: Row) => (row: Row): boolean => {
  for (const [key, value] of Object.entries(where)) {
    if (key === "NOT") {
      const notClause = value as Row;
      for (const [nk, nv] of Object.entries(notClause)) {
        if (valueEquals(row[nk], nv)) return false;
      }
      continue;
    }
    if (value && typeof value === "object" && !(value instanceof Date) && "in" in (value as Row)) {
      const options = (value as { in: unknown[] }).in;
      if (!options.some((opt) => valueEquals(row[key], opt))) return false;
      continue;
    }
    if (!valueEquals(row[key], value)) return false;
  }
  return true;
};

/**
 * In-memory stand-in for the real Prisma client, mirroring the two invariants
 * that matter for these tests: deleteMany/findMany filter with plain equality
 * (Dates compared by value, `NOT` for exclusion), and createMany with
 * skipDuplicates silently drops a row that collides on [employeeId, date, dayPart]
 * — the actual composite unique constraint on Assignment — rather than throwing.
 */
class FakeBoardDb implements BoardMutationDb {
  assignments: Row[] = [];
  availabilities: Row[] = [];
  holidays: Row[] = [];

  assignment = {
    findMany: async ({ where }: { where: Row }) => this.assignments.filter(matchesWhere(where)) as never,
    deleteMany: async ({ where }: { where: Row }) => {
      const before = this.assignments.length;
      this.assignments = this.assignments.filter((row) => !matchesWhere(where)(row));
      return { count: before - this.assignments.length };
    },
    upsert: async ({ where, update, create }: { where: { employeeId_date_dayPart: Row }; update: Row; create: Row }) => {
      const key = where.employeeId_date_dayPart;
      const idx = this.assignments.findIndex(
        (row) =>
          row.employeeId === key.employeeId &&
          valueEquals(row.date, key.date) &&
          row.dayPart === key.dayPart,
      );
      if (idx >= 0) {
        this.assignments[idx] = { ...this.assignments[idx], ...update };
        return this.assignments[idx] as never;
      }
      this.assignments.push(create);
      return create as never;
    },
    createMany: async ({ data }: { data: Row[]; skipDuplicates: true }) => {
      let count = 0;
      for (const row of data) {
        const exists = this.assignments.some(
          (existing) =>
            existing.employeeId === row.employeeId &&
            valueEquals(existing.date, row.date) &&
            existing.dayPart === row.dayPart,
        );
        if (exists) continue; // skipDuplicates: true
        this.assignments.push(row);
        count++;
      }
      return { count };
    },
  };

  availability = {
    findMany: async ({ where }: { where: Row }) => this.availabilities.filter(matchesWhere(where)) as never,
    upsert: async ({ where, update, create }: { where: { employeeId_date_dayPart: Row }; update: Row; create: Row }) => {
      const key = where.employeeId_date_dayPart;
      const idx = this.availabilities.findIndex(
        (row) =>
          row.employeeId === key.employeeId &&
          valueEquals(row.date, key.date) &&
          row.dayPart === key.dayPart,
      );
      if (idx >= 0) {
        this.availabilities[idx] = { ...this.availabilities[idx], ...update };
        return this.availabilities[idx] as never;
      }
      this.availabilities.push(create);
      return create as never;
    },
    deleteMany: async ({ where }: { where: Row }) => {
      const before = this.availabilities.length;
      this.availabilities = this.availabilities.filter((row) => !matchesWhere(where)(row));
      return { count: before - this.availabilities.length };
    },
  };

  holiday = {
    upsert: async ({ where, update, create }: { where: { date: Date }; update: Row; create: Row }) => {
      const idx = this.holidays.findIndex((row) => valueEquals(row.date, where.date));
      if (idx >= 0) {
        this.holidays[idx] = { ...this.holidays[idx], ...update };
        return this.holidays[idx] as never;
      }
      this.holidays.push(create);
      return create as never;
    },
    delete: async ({ where }: { where: { date: Date } }) => {
      const idx = this.holidays.findIndex((row) => valueEquals(row.date, where.date));
      const [removed] = this.holidays.splice(idx, 1);
      return removed as never;
    },
  };
}

const DAY = "2026-04-13T00:00:00.000Z";
const WEEK = "week-1";

await run("split then merge round-trips back to a single full_day row", async () => {
  const db = new FakeBoardDb();
  await updateAssignment(db, "e1", "p1", DAY, WEEK, "full_day");

  await splitAssignment(db, "e1", "p1", DAY, WEEK);
  assert.deepEqual(
    db.assignments.map((a) => a.dayPart).sort(),
    ["after_lunch", "pre_lunch"],
  );

  await mergeAssignment(db, "e1", "p1", DAY, WEEK);
  assert.equal(db.assignments.length, 1);
  assert.equal(db.assignments[0]!.dayPart, "full_day");
  assert.equal(db.assignments[0]!.projectId, "p1");
});

await run("marking an absence clears exactly that day's assignments and no more", async () => {
  const db = new FakeBoardDb();
  const otherDay = "2026-04-14T00:00:00.000Z";
  await updateAssignment(db, "e1", "p1", DAY, WEEK, "full_day");
  await updateAssignment(db, "e1", "p1", otherDay, WEEK, "full_day");
  await updateAssignment(db, "e2", "p1", DAY, WEEK, "full_day"); // different employee, same day

  await setAvailability(db, "e1", DAY, WEEK, "sick");

  assert.deepEqual(
    db.assignments.map((a) => `${a.employeeId}:${(a.date as Date).toISOString()}`).sort(),
    [`e1:${otherDay}`, `e2:${DAY}`],
  );
  assert.equal(db.availabilities.length, 1);
  assert.equal(db.availabilities[0]!.employeeId, "e1");
});

await run("marking one half sick converts a full_day assignment into the surviving half", async () => {
  const db = new FakeBoardDb();
  await updateAssignment(db, "e1", "p1", DAY, WEEK, "full_day");

  await setAvailability(db, "e1", DAY, WEEK, "sick", "pre_lunch");

  assert.deepEqual(
    db.assignments.map((a) => ({ dayPart: a.dayPart, projectId: a.projectId })),
    [{ dayPart: "after_lunch", projectId: "p1" }],
  );
  assert.deepEqual(
    db.availabilities.map((a) => ({ dayPart: a.dayPart, status: a.status })),
    [{ dayPart: "pre_lunch", status: "sick" }],
  );
});

await run("marking the second half with the same status collapses to one full_day absence, no assignment left", async () => {
  const db = new FakeBoardDb();
  await updateAssignment(db, "e1", "p1", DAY, WEEK, "full_day");
  await setAvailability(db, "e1", DAY, WEEK, "sick", "pre_lunch");

  await setAvailability(db, "e1", DAY, WEEK, "sick", "after_lunch");

  assert.equal(db.assignments.filter((a) => a.employeeId === "e1").length, 0);
  assert.deepEqual(
    db.availabilities.map((a) => ({ dayPart: a.dayPart, status: a.status })),
    [{ dayPart: "full_day", status: "sick" }],
  );
});

await run("marking the second half with a different status keeps two half-day records", async () => {
  const db = new FakeBoardDb();
  await updateAssignment(db, "e1", "p1", DAY, WEEK, "full_day");
  await setAvailability(db, "e1", DAY, WEEK, "sick", "pre_lunch");

  await setAvailability(db, "e1", DAY, WEEK, "vacation", "after_lunch");

  assert.equal(db.assignments.filter((a) => a.employeeId === "e1").length, 0);
  assert.deepEqual(
    db.availabilities
      .map((a) => ({ dayPart: String(a.dayPart), status: a.status }))
      .sort((a, b) => a.dayPart.localeCompare(b.dayPart)),
    [
      { dayPart: "after_lunch", status: "vacation" },
      { dayPart: "pre_lunch", status: "sick" },
    ],
  );
});

await run("marking a full day as school clears assignments and records a school absence", async () => {
  const db = new FakeBoardDb();
  await updateAssignment(db, "e1", "p1", DAY, WEEK, "full_day");

  await setAvailability(db, "e1", DAY, WEEK, "school");

  assert.equal(db.assignments.filter((a) => a.employeeId === "e1").length, 0);
  assert.deepEqual(
    db.availabilities.map((a) => ({ dayPart: a.dayPart, status: a.status })),
    [{ dayPart: "full_day", status: "school" }],
  );
});

await run("clearAvailability removes only the matching dayPart", async () => {
  const db = new FakeBoardDb();
  await setAvailability(db, "e1", DAY, WEEK, "sick", "pre_lunch");
  await setAvailability(db, "e1", DAY, WEEK, "vacation", "after_lunch");
  assert.equal(db.availabilities.length, 2);

  await clearAvailability(db, "e1", DAY, "pre_lunch");

  assert.equal(db.availabilities.length, 1);
  assert.equal(db.availabilities[0]!.dayPart, "after_lunch");
});

await run("copyDayAssignments overwrites existing target-day project assignments", async () => {
  const db = new FakeBoardDb();
  const sourceDay = "2026-04-13T00:00:00.000Z";
  const targetDay = "2026-04-14T00:00:00.000Z";
  await updateAssignment(db, "e1", "p1", sourceDay, WEEK, "full_day");
  await updateAssignment(db, "e2", "p2", targetDay, WEEK, "full_day"); // pre-existing, should be wiped

  await copyDayAssignments(db, sourceDay, targetDay, WEEK);

  const targetRows = db.assignments.filter((a) => valueEquals(a.date, new Date(targetDay)));
  assert.deepEqual(
    targetRows.map((a) => ({ employeeId: a.employeeId, projectId: a.projectId })),
    [{ employeeId: "e1", projectId: "p1" }],
  );
  // Source day is untouched.
  assert.equal(db.assignments.filter((a) => valueEquals(a.date, new Date(sourceDay))).length, 1);
});

await run(
  "copyWeekAssignments silently drops a copied row when a stale assignment from another week already holds that [employeeId, date, dayPart]",
  async () => {
    // Assignment's real unique constraint is [employeeId, date, dayPart] only — weekId is not
    // part of the key (see CLAUDE.md). copyWeekAssignments deletes existing target-week rows
    // scoped by weekId before copying, so a row belonging to a *different* weekId that happens
    // to land on the same physical date is never cleared. skipDuplicates: true then means the
    // copy for that employee/day silently does nothing instead of throwing or overwriting.
    // This test documents that current, fragile behavior so a future fix has a red test to turn green.
    const db = new FakeBoardDb();
    const sourceWeekStart = "2026-04-13T00:00:00.000Z";
    const targetWeekStart = "2026-04-20T00:00:00.000Z";

    await updateAssignment(db, "e1", "p1", sourceWeekStart, "week-source", "full_day");
    // Stale row: same employee/date/dayPart as the copy target, but a different weekId.
    db.assignments.push({
      employeeId: "e1",
      projectId: "p-stale",
      date: new Date(targetWeekStart),
      weekId: "week-other",
      dayPart: "full_day",
    });

    await copyWeekAssignments(db, "week-source", "week-target", sourceWeekStart, targetWeekStart);

    const targetDateRows = db.assignments.filter((a) => valueEquals(a.date, new Date(targetWeekStart)));
    assert.equal(targetDateRows.length, 1);
    assert.equal(targetDateRows[0]!.projectId, "p-stale");
    assert.equal(targetDateRows[0]!.weekId, "week-other");
  },
);
