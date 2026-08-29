/**
 * Small ULID generator — no dependency. Crockford base32, 48-bit time + 80-bit
 * random. Sufficient for render_job_id (`rj_<ulid>`).
 */
import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

function encodeTime(now: number, len: number): string {
  let out = "";
  for (let i = len - 1; i >= 0; i--) {
    const mod = now % 32;
    out = ALPHABET[mod] + out;
    now = (now - mod) / 32;
  }
  return out;
}

function encodeRandom(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i]! % 32];
  }
  return out;
}

export function ulid(): string {
  return encodeTime(Date.now(), 10) + encodeRandom(16);
}

export function renderJobId(): string {
  return `rj_${ulid()}`;
}
