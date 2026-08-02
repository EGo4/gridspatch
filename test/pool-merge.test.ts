import assert from "node:assert/strict";

import { addHalfToPool } from "../src/components/board/poolMerge.ts";

const run = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

const alice = { id: "e1", name: "Alice", img: null };

await run("adds a lone half card to the half-day pool bucket", () => {
  const next = addHalfToPool({}, "Monday", alice, "pre_lunch");
  assert.deepEqual(next["pool-Monday-half"], [{ employee: alice, dayPart: "pre_lunch" }]);
  assert.equal(next["pool-Monday"], undefined);
});

await run("merges with the sibling half already in the pool into one full_day card", () => {
  const state = { "pool-Monday-half": [{ employee: alice, dayPart: "pre_lunch" as const }] };
  const next = addHalfToPool(state, "Monday", alice, "after_lunch");
  assert.deepEqual(next["pool-Monday-half"], []);
  assert.deepEqual(next["pool-Monday"], [{ employee: alice, dayPart: "full_day" }]);
});

await run("does not merge halves belonging to different employees", () => {
  const bob = { id: "e2", name: "Bob", img: null };
  const state = { "pool-Monday-half": [{ employee: alice, dayPart: "pre_lunch" as const }] };
  const next = addHalfToPool(state, "Monday", bob, "after_lunch");
  assert.deepEqual(next["pool-Monday-half"], [
    { employee: alice, dayPart: "pre_lunch" },
    { employee: bob, dayPart: "after_lunch" },
  ]);
  assert.equal(next["pool-Monday"], undefined);
});

await run("appends alongside an unrelated existing full_day pool entry for another employee", () => {
  const bob = { id: "e2", name: "Bob", img: null };
  const state = { "pool-Monday": [{ employee: bob, dayPart: "full_day" as const }] };
  const next = addHalfToPool(state, "Monday", alice, "pre_lunch");
  assert.deepEqual(next["pool-Monday"], [{ employee: bob, dayPart: "full_day" }]);
  assert.deepEqual(next["pool-Monday-half"], [{ employee: alice, dayPart: "pre_lunch" }]);
});
