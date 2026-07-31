// src/lib/imageUpload.ts

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const ALLOWED_IMAGE_TYPES = Object.keys(EXTENSION_BY_TYPE);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function extensionForType(type: string): string {
  const ext = EXTENSION_BY_TYPE[type];
  if (!ext) throw new Error(`Unsupported image type: ${type}`);
  return ext;
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
