import assert from "node:assert/strict";

import { ROLE_KEYS, isRoleKey, normalizeRoleFreeText } from "../src/lib/roles.ts";

const run = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

await run("normalizeRoleFreeText maps known free-text variants case-insensitively", () => {
  assert.equal(normalizeRoleFreeText("Azubi"), "apprentice");
  assert.equal(normalizeRoleFreeText("azubi"), "apprentice");
  assert.equal(normalizeRoleFreeText("Lehrling"), "apprentice");
  assert.equal(normalizeRoleFreeText("Angestellter"), "staff");
});

await run("normalizeRoleFreeText folds every former trade-specific role onto staff", () => {
  assert.equal(normalizeRoleFreeText("Vorarbeiter"), "staff");
  assert.equal(normalizeRoleFreeText("Maurer"), "staff");
  assert.equal(normalizeRoleFreeText("Elektrikerin"), "staff");
  assert.equal(normalizeRoleFreeText("Tiefbau"), "staff");
});

await run("normalizeRoleFreeText returns null for unmapped text and empty input", () => {
  assert.equal(normalizeRoleFreeText("Crane operator"), null);
  assert.equal(normalizeRoleFreeText(""), null);
  assert.equal(normalizeRoleFreeText(null), null);
  assert.equal(normalizeRoleFreeText(undefined), null);
});

await run("normalizeRoleFreeText is idempotent on an already-valid key", () => {
  for (const key of ROLE_KEYS) {
    assert.equal(normalizeRoleFreeText(key), key);
  }
});

await run("isRoleKey accepts only known keys", () => {
  assert.equal(isRoleKey("apprentice"), true);
  assert.equal(isRoleKey("Azubi"), false);
  assert.equal(isRoleKey("made-up-role"), false);
});
