import { NextResponse } from "next/server";
import { requireSession } from "~/server/better-auth/roles";
import { readUploadedFile } from "~/lib/imageUpload";

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { filename } = await params;
  const file = await readUploadedFile("employees", filename);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
