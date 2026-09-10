import type { VersionStatus } from "./types.js";

export const VERSION_STATUSES: readonly VersionStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
] as const;

/**
 * Allowed transitions. PUBLISHED is terminal except for ARCHIVED; nothing ever
 * returns to DRAFT once published, because published versions are immutable.
 *
 * Decision (MVP): `POST /publish` may take DRAFT | SUBMITTED | APPROVED straight
 * to PUBLISHED, because there is no reviewer role yet. The intermediate states
 * exist in the model and via the status endpoint so a review workflow can be
 * layered on without a data migration. See docs/versioning-strategy.md.
 */
const TRANSITIONS: Record<VersionStatus, readonly VersionStatus[]> = {
  DRAFT: ["SUBMITTED", "APPROVED", "PUBLISHED", "ARCHIVED"],
  SUBMITTED: ["DRAFT", "APPROVED", "PUBLISHED", "ARCHIVED"],
  APPROVED: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransition(from: VersionStatus, to: VersionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: VersionStatus, to: VersionStatus): void {
  if (!canTransition(from, to)) {
    throw new LifecycleError(from, to);
  }
}

/** Once a version is here, its metadata and artifacts must never change. */
export function isImmutable(status: VersionStatus): boolean {
  return status === "PUBLISHED" || status === "ARCHIVED";
}

export class LifecycleError extends Error {
  constructor(
    readonly from: VersionStatus,
    readonly to: VersionStatus,
  ) {
    super(`illegal lifecycle transition ${from} -> ${to}`);
    this.name = "LifecycleError";
  }
}
