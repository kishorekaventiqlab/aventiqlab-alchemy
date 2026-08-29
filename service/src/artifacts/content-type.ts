/** Suffix -> MIME fallback when an S3 object has no ContentType metadata. */
const BY_SUFFIX: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".txt": "text/plain",
};

export function contentTypeForKey(key: string): string {
  const dot = key.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  return BY_SUFFIX[key.slice(dot).toLowerCase()] ?? "application/octet-stream";
}
