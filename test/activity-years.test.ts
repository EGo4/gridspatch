import assert from "node:assert/strict";

import { buildActivityYears } from "../src/server/services/activityYears.ts";

const run = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

await run("aggregates years per project and employee, deduped and sorted desc", () => {
  const result = buildActivityYears(
    [
      { projectId: "p1", year: 2024 },
      { projectId: "p1", year: 2025 },
      { projectId: "p2", year: 2024 },
    ],
    [
      { employeeId: "e1", year: 2023 },
      { employeeId: "e1", year: 2024 },
      { employeeId: "e2", year: 2025 },
    ],
  );

  assert.deepEqual(result.years, [2025, 2024, 2023]);
  assert.deepEqual(result.projectYears, { p1: [2024, 2025], p2: [2024] });
  assert.deepEqual(result.employeeYears, { e1: [2023, 2024], e2: [2025] });
});

await run("returns empty maps and year list when there are no assignments", () => {
  const result = buildActivityYears([], []);
  assert.deepEqual(result.years, []);
  assert.deepEqual(result.projectYears, {});
  assert.deepEqual(result.employeeYears, {});
});
