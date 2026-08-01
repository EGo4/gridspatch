// src/lib/imageUpload.ts

import path from "path";
import { readFile } from "fs/promises";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const TYPE_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_TYPE).map(([type, ext]) => [ext, type]),
);

export const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSION_BY_TYPE);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type UploadKind = "employees" | "users";

export function extensionForType(type: string): string {
  const ext = EXTENSION_BY_TYPE[type];
  if (!ext) throw new Error(`Unsupported image type: ${type}`);
  return ext;
}

/** Reverse of extensionForType, used when *serving* a stored file: the
 * Content-Type is derived from this fixed map, never from anything client- or
 * filesystem-supplied. */
export function mimeForExtension(ext: string): string | null {
  return TYPE_BY_EXTENSION[ext] ?? null;
}

const UPLOAD_FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

/** Every stored upload is named `${randomUUID()}.${ext}` — never trust a
 * filename read back from a request path until it matches this exactly, so a
 * crafted `../../etc/passwd`-style segment can never reach the filesystem. */
export function isValidUploadFilename(filename: string): boolean {
  return UPLOAD_FILENAME_RE.test(filename);
}

/** Directory uploaded files of this kind are written to / read from — kept
 * outside `public/` so it can sit behind a session check and survive
 * redeploys via a mounted volume (see docker-compose.yml). */
export function uploadDir(kind: UploadKind): string {
  return path.join(process.cwd(), "data", "uploads", kind);
}

/**
 * Reads an uploaded file back for serving, or returns null if the filename
 * doesn't match the expected `${uuid}.${ext}` shape or doesn't exist.
 * Callers must check the caller's session before invoking this — it does not
 * do that itself, since the two upload kinds require different roles.
 */
export async function readUploadedFile(
  kind: UploadKind,
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isValidUploadFilename(filename)) return null;
  const ext = filename.slice(filename.lastIndexOf(".") + 1);
  const contentType = mimeForExtension(ext);
  if (!contentType) return null;

  try {
    const buffer = await readFile(path.join(uploadDir(kind), filename));
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/** Confirms the file's actual bytes match its declared MIME type, so a
 * forged Content-Type can't be used to smuggle a different file type past
 * the extension check. */
export function matchesMagicBytes(type: string, buffer: Buffer): boolean {
  switch (type) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return (
        buffer.length >= 8 &&
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buffer[i] === b)
      );
    case "image/gif":
      return buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "GIF8";
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    default:
      return false;
  }
}
