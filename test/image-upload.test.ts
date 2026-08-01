import assert from "node:assert/strict";

import {
  extensionForType,
  mimeForExtension,
  isValidUploadFilename,
  matchesMagicBytes,
} from "../src/lib/imageUpload.ts";

const run = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

await run("extensionForType and mimeForExtension round-trip for every allowed type", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
    const ext = extensionForType(type);
    assert.equal(mimeForExtension(ext), type);
  }
});

await run("extensionForType throws for an unsupported type", () => {
  assert.throws(() => extensionForType("image/svg+xml"));
});

await run("mimeForExtension returns null for an unknown extension", () => {
  assert.equal(mimeForExtension("html"), null);
  assert.equal(mimeForExtension("svg"), null);
});

await run("isValidUploadFilename accepts a real randomUUID-shaped filename", () => {
  assert.equal(isValidUploadFilename("c1a2b3d4-e5f6-4789-a0b1-c2d3e4f5a6b7.jpg"), true);
  assert.equal(isValidUploadFilename("00000000-0000-0000-0000-000000000000.png"), true);
});

await run("isValidUploadFilename rejects path traversal and non-uuid names", () => {
  assert.equal(isValidUploadFilename("../../etc/passwd"), false);
  assert.equal(isValidUploadFilename("..%2F..%2Fetc%2Fpasswd.jpg"), false);
  assert.equal(isValidUploadFilename("payload.html"), false);
  assert.equal(isValidUploadFilename("c1a2b3d4-e5f6-4789-a0b1-c2d3e4f5a6b7.svg"), false);
  assert.equal(isValidUploadFilename("c1a2b3d4-e5f6-4789-a0b1-c2d3e4f5a6b7"), false);
  assert.equal(isValidUploadFilename(""), false);
});

await run("matchesMagicBytes validates real file signatures", () => {
  assert.equal(matchesMagicBytes("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(
    matchesMagicBytes("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    true,
  );
  assert.equal(matchesMagicBytes("image/gif", Buffer.from("GIF89a")), true);
  assert.equal(matchesMagicBytes("image/webp", Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")])), true);
});

await run("matchesMagicBytes rejects a mismatched or forged payload", () => {
  const htmlPayload = Buffer.from("<script>alert(1)</script>");
  assert.equal(matchesMagicBytes("image/png", htmlPayload), false);
  assert.equal(matchesMagicBytes("image/jpeg", htmlPayload), false);
  assert.equal(matchesMagicBytes("text/html", htmlPayload), false);
});
