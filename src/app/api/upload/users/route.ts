import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { requireSession } from "~/server/better-auth/roles";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, extensionForType, matchesMagicBytes, uploadDir } from "~/lib/imageUpload";

// Any authenticated user, not admin-only: /profile lets every role upload
// their own avatar through this same endpoint (see ProfileClient.tsx). Who
// may attach the result to which User row is enforced downstream, in
// updateCurrentUser (self only) vs. updateUser (admin only).
export async function POST(request: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP, or GIF allowed" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "File exceeds 5 MB limit" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesMagicBytes(file.type, buffer)) {
    return NextResponse.json({ error: "File content does not match its declared type" }, { status: 400 });
  }

  const filename = `${randomUUID()}.${extensionForType(file.type)}`;
  const dir = uploadDir("users");

  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);

  return NextResponse.json({ url: `/api/files/users/${filename}` });
}
