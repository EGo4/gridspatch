import assert from "node:assert/strict";

import {
  getDraggableId,
  parseFromDraggableId,
  getDayFromDroppableId,
  getProjectIdFromDroppableId,
  getDayPartFromDroppableId,
  fullDayDroppableId,
  preLunchDroppableId,
  afterLunchDroppableId,
  poolFullDayId,
} from "../src/components/board/boardIds.ts";

const run = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

await run("getDraggableId and parseFromDraggableId round-trip", () => {
  const id = getDraggableId("emp1", "Wednesday", "pre_lunch");
  assert.equal(id, "emp1::Wednesday::pre_lunch");
  assert.deepEqual(parseFromDraggableId(id), {
    employeeId: "emp1",
    day: "Wednesday",
    dayPart: "pre_lunch",
  });
});

await run("parseFromDraggableId defaults to full_day when the suffix is missing", () => {
  assert.deepEqual(parseFromDraggableId("emp1::Wednesday"), {
    employeeId: "emp1",
    day: "Wednesday",
    dayPart: "full_day",
  });
});

await run("fullDayDroppableId/preLunchDroppableId/afterLunchDroppableId encode project cells", () => {
  assert.equal(fullDayDroppableId("proj1", "Monday"), "proj1-Monday");
  assert.equal(preLunchDroppableId("proj1", "Monday"), "proj1-Monday-pre");
  assert.equal(afterLunchDroppableId("proj1", "Monday"), "proj1-Monday-post");
});

await run("poolFullDayId encodes pool cells", () => {
  assert.equal(poolFullDayId("Friday"), "pool-Friday");
});

await run("getDayFromDroppableId extracts the day from project and pool cells", () => {
  assert.equal(getDayFromDroppableId("proj1-Tuesday"), "Tuesday");
  assert.equal(getDayFromDroppableId("proj1-Tuesday-pre"), "Tuesday");
  assert.equal(getDayFromDroppableId("proj1-Tuesday-post"), "Tuesday");
  assert.equal(getDayFromDroppableId("pool-Tuesday"), "Tuesday");
});

await run("getDayFromDroppableId returns empty string for an unrecognised id", () => {
  assert.equal(getDayFromDroppableId("not-a-real-cell"), "");
});

await run("getProjectIdFromDroppableId extracts the project id, null for pool cells", () => {
  assert.equal(getProjectIdFromDroppableId("proj1-Tuesday"), "proj1");
  assert.equal(getProjectIdFromDroppableId("proj1-Tuesday-pre"), "proj1");
  assert.equal(getProjectIdFromDroppableId("proj1-Tuesday-post"), "proj1");
  assert.equal(getProjectIdFromDroppableId("pool-Tuesday"), null);
});

await run("getDayPartFromDroppableId reads the -pre/-post suffix", () => {
  assert.equal(getDayPartFromDroppableId("proj1-Tuesday-pre"), "pre_lunch");
  assert.equal(getDayPartFromDroppableId("proj1-Tuesday-post"), "after_lunch");
  assert.equal(getDayPartFromDroppableId("proj1-Tuesday"), "full_day");
  assert.equal(getDayPartFromDroppableId("pool-Tuesday"), "full_day");
});
