import assert from "node:assert/strict";

import { availabilityKey, parseAvailabilityKey } from "../src/components/board/availabilityKey.ts";

const run = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

await run("availabilityKey and parseAvailabilityKey round-trip for every dayPart", () => {
  for (const dayPart of ["full_day", "pre_lunch", "after_lunch"] as const) {
    const key = availabilityKey("emp1", "Wednesday", dayPart);
    assert.equal(key, `emp1-Wednesday-${dayPart}`);
    assert.deepEqual(parseAvailabilityKey(key), { employeeId: "emp1", day: "Wednesday", dayPart });
  }
});

await run("parseAvailabilityKey returns null for an unrecognised key", () => {
  assert.equal(parseAvailabilityKey("not-a-valid-key"), null);
  assert.equal(parseAvailabilityKey(""), null);
});

await run("parseAvailabilityKey keeps a dashed employeeId intact", () => {
  // employeeIds are cuids in practice (no dashes), but the parser should still
  // recover the day/dayPart correctly and leave everything before it as-is.
  assert.deepEqual(parseAvailabilityKey("emp-with-dash-Friday-pre_lunch"), {
    employeeId: "emp-with-dash",
    day: "Friday",
    dayPart: "pre_lunch",
  });
});
