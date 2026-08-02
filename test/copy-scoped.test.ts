import assert from "node:assert/strict";

import { applyScopedDayCopy } from "../src/components/board/copyScoped.ts";
import { fullDayDroppableId, preLunchDroppableId, afterLunchDroppableId, poolFullDayId } from "../src/components/board/boardIds.ts";
import { availabilityKey } from "../src/components/board/availabilityKey.ts";
import type { Project } from "../src/types/index.ts";

const run = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

const alice = { id: "e1", name: "Alice", img: null, role: null };
const bob = { id: "e2", name: "Bob", img: null, role: null };
const carol = { id: "e3", name: "Carol", img: null, role: null };
const employees = [alice, bob, carol];

const project = (id: string): Project => ({
  id,
  name: id,
  description: null,
  status: "active",
  constructionManagerId: null,
  constructionManagerName: null,
});
const projects = [project("p1"), project("p2")];

await run("copies the selected project's cells from source to target day", () => {
  const prev = {
    [fullDayDroppableId("p1", "Monday")]: [{ employee: alice, dayPart: "full_day" as const }],
  };

  const { state, skipped } = applyScopedDayCopy(prev, projects, employees, {}, ["p1"], "Monday", "Tuesday");

  assert.equal(skipped, 0);
  assert.deepEqual(state[fullDayDroppableId("p1", "Tuesday")], [{ employee: alice, dayPart: "full_day" }]);
});

await run("leaves an unselected project's target-day cell untouched", () => {
  const prev = {
    [fullDayDroppableId("p1", "Monday")]: [{ employee: alice, dayPart: "full_day" as const }],
    [fullDayDroppableId("p2", "Tuesday")]: [{ employee: bob, dayPart: "full_day" as const }],
  };

  const { state } = applyScopedDayCopy(prev, projects, employees, {}, ["p1"], "Monday", "Tuesday");

  assert.deepEqual(state[fullDayDroppableId("p2", "Tuesday")], [{ employee: bob, dayPart: "full_day" }]);
});

await run("skips and counts an employee already booked on an unselected site on the target day", () => {
  const prev = {
    [fullDayDroppableId("p1", "Monday")]: [{ employee: alice, dayPart: "full_day" as const }],
    [fullDayDroppableId("p2", "Tuesday")]: [{ employee: alice, dayPart: "full_day" as const }],
  };

  const { state, skipped } = applyScopedDayCopy(prev, projects, employees, {}, ["p1"], "Monday", "Tuesday");

  assert.equal(skipped, 1);
  assert.deepEqual(state[fullDayDroppableId("p1", "Tuesday")], []);
  // Not stolen from site B.
  assert.deepEqual(state[fullDayDroppableId("p2", "Tuesday")], [{ employee: alice, dayPart: "full_day" }]);
});

await run("skips an employee absent on the target day", () => {
  const prev = {
    [fullDayDroppableId("p1", "Monday")]: [{ employee: alice, dayPart: "full_day" as const }],
  };
  const availability = { [availabilityKey("e1", "Tuesday", "full_day")]: "vacation" };

  const { state, skipped } = applyScopedDayCopy(prev, projects, employees, availability, ["p1"], "Monday", "Tuesday");

  assert.equal(skipped, 1);
  assert.deepEqual(state[fullDayDroppableId("p1", "Tuesday")], []);
});

await run(
  "skips both halves of an employee split across two sites when only one site is selected",
  () => {
    const prev = {
      [preLunchDroppableId("p1", "Monday")]: [{ employee: alice, dayPart: "pre_lunch" as const }],
      [afterLunchDroppableId("p2", "Monday")]: [{ employee: alice, dayPart: "after_lunch" as const }],
    };

    const { state, skipped } = applyScopedDayCopy(prev, projects, employees, {}, ["p1"], "Monday", "Tuesday");

    // Only the morning cell was ever a copy candidate (site B isn't
    // selected), and it's blocked rather than copied alone.
    assert.equal(skipped, 1);
    assert.deepEqual(state[preLunchDroppableId("p1", "Tuesday")], []);
    // Not stranded on site A with no visible record of the afternoon — back
    // in Tuesday's pool instead, alongside Bob and Carol (who have nothing
    // else going on that day either).
    assert.deepEqual(state[poolFullDayId("Tuesday")], [
      { employee: alice, dayPart: "full_day" },
      { employee: bob, dayPart: "full_day" },
      { employee: carol, dayPart: "full_day" },
    ]);
  },
);

await run("copies both halves of a split employee when both their sites are selected", () => {
  const prev = {
    [preLunchDroppableId("p1", "Monday")]: [{ employee: alice, dayPart: "pre_lunch" as const }],
    [afterLunchDroppableId("p2", "Monday")]: [{ employee: alice, dayPart: "after_lunch" as const }],
  };

  const { state, skipped } = applyScopedDayCopy(prev, projects, employees, {}, ["p1", "p2"], "Monday", "Tuesday");

  assert.equal(skipped, 0);
  assert.deepEqual(state[preLunchDroppableId("p1", "Tuesday")], [{ employee: alice, dayPart: "pre_lunch" }]);
  assert.deepEqual(state[afterLunchDroppableId("p2", "Tuesday")], [{ employee: alice, dayPart: "after_lunch" }]);
});

await run("does not flag a split pair sharing the same site as stranded", () => {
  const prev = {
    [preLunchDroppableId("p1", "Monday")]: [{ employee: alice, dayPart: "pre_lunch" as const }],
    [afterLunchDroppableId("p1", "Monday")]: [{ employee: alice, dayPart: "after_lunch" as const }],
  };

  const { state, skipped } = applyScopedDayCopy(prev, projects, employees, {}, ["p1"], "Monday", "Tuesday");

  assert.equal(skipped, 0);
  assert.deepEqual(state[preLunchDroppableId("p1", "Tuesday")], [{ employee: alice, dayPart: "pre_lunch" }]);
  assert.deepEqual(state[afterLunchDroppableId("p1", "Tuesday")], [{ employee: alice, dayPart: "after_lunch" }]);
});

await run("rebuilds the target day's pool from whoever ends up unassigned and not absent", () => {
  const prev = {
    [fullDayDroppableId("p1", "Monday")]: [{ employee: alice, dayPart: "full_day" as const }],
  };
  const availability = { [availabilityKey("e2", "Tuesday", "full_day")]: "sick" };

  const { state } = applyScopedDayCopy(prev, projects, employees, availability, ["p1"], "Monday", "Tuesday");

  // Alice lands on site A; Bob is absent; Carol has nothing else going on, so
  // she's the only one left in the pool.
  assert.deepEqual(state[poolFullDayId("Tuesday")], [{ employee: carol, dayPart: "full_day" }]);
});
