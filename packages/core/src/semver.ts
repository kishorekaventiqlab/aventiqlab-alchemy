/** Strict semver core (MAJOR.MINOR.PATCH). No pre-release or build metadata in v1. */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseSemver(input: string): SemVer {
  const m = SEMVER_RE.exec(input);
  if (!m) throw new Error(`invalid semver: "${input}" (expected MAJOR.MINOR.PATCH)`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function isSemver(input: string): boolean {
  return SEMVER_RE.test(input);
}

export function compareSemver(a: string, b: string): number {
  const x = parseSemver(a);
  const y = parseSemver(b);
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

const PAD = 6;

/**
 * Lexicographically sortable form used in DynamoDB sort keys:
 * "1.2.3" -> "000001.000002.000003". Each component is capped at 999999.
 */
export function padSemver(input: string): string {
  const v = parseSemver(input);
  for (const n of [v.major, v.minor, v.patch]) {
    if (n >= 10 ** PAD) throw new Error(`semver component too large for sort key: ${input}`);
  }
  const p = (n: number) => String(n).padStart(PAD, "0");
  return `${p(v.major)}.${p(v.minor)}.${p(v.patch)}`;
}

export function unpadSemver(padded: string): string {
  return padded
    .split(".")
    .map((s) => String(Number(s)))
    .join(".");
}
