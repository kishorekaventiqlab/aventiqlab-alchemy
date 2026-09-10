/**
 * Request/response shapes shared by the API Lambda and the CLI.
 * Documented for consumers in docs/api-contract.md — keep the two in sync.
 */
import type { ArtifactDigest, ArtifactKind, CompetencyLevel, Level, Manifest, Skill, VersionStatus } from "./types.js";

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_failed"
  | "conflict"
  | "immutable_version"
  | "artifacts_not_ready"
  | "unknown_skill"
  | "bad_request"
  | "internal";

/* ------------------------------------------------------------ Experiences */

export interface ExperienceSummary {
  experienceId: string;
  title: string;
  summary: string;
  domain: string;
  category: string;
  level: Level;
  difficulty: number;
  tags: string[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  latestVersion: string | null;
  latestPublishedVersion: string | null;
  /** publishedAt of latestPublishedVersion. Lets a consumer holding a pinned version detect a newer one. */
  latestPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactRef {
  artifactId: string;
  kind: ArtifactKind;
  path: string;
  contentType: string;
  title?: string;
  sizeBytes: number;
  sha256: string;
  durationSeconds?: number;
  language?: string;
  skillIds?: string[];
  /** Relative API path that mints a presigned GET for this artifact. */
  urlPath: string;
}

export interface VersionSummary {
  experienceId: string;
  version: string;
  status: VersionStatus;
  s3Prefix: string;
  /**
   * Stable identity of this version's bytes: sha256 over the manifest digest and every
   * artifact digest. Same content => same hash; acts as an ETag for the version.
   */
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  changelog?: string;
}

export interface VersionDetail extends VersionSummary {
  manifest: Manifest;
  artifacts: ArtifactRef[];
  /** Lifecycle audit trail, oldest first. */
  statusHistory: { from: VersionStatus | null; to: VersionStatus; at: string; actor: string; note?: string }[];
}

/** GET /experiences/{id} */
export interface ExperienceResponse {
  experience: ExperienceSummary;
  /** Latest published version unless ?version= asked for another. Null when nothing is published. */
  version: VersionDetail | null;
  links: {
    self: string;
    versions: string;
    content: string | null;
  };
}

export interface ListExperiencesResponse {
  items: ExperienceSummary[];
  nextCursor: string | null;
}

export interface ListVersionsResponse {
  experienceId: string;
  items: VersionSummary[];
}

export interface SignedArtifact extends ArtifactRef {
  url: string;
  expiresAt: string;
}

/** GET /experiences/{id}/content */
export interface ContentResponse {
  experienceId: string;
  version: string;
  status: VersionStatus;
  manifest: Manifest;
  artifacts: SignedArtifact[];
  expiresAt: string;
}

/** GET /experiences/{id}/versions/{v}/artifacts/{artifactId}/url */
export interface ArtifactUrlResponse {
  experienceId: string;
  version: string;
  artifact: SignedArtifact;
}

/* ------------------------------------------------------------------ Skills */

export interface SkillResponse {
  skill: Skill;
  updatedAt: string;
}

export interface ListSkillsResponse {
  items: (Skill & { updatedAt: string })[];
  nextCursor: string | null;
}

export interface SkillExperiencesResponse {
  skillId: string;
  items: { experienceId: string; version: string; relation: "TAUGHT" | "ASSESSED" | "REQUIRED"; level: CompetencyLevel; versionStatus: VersionStatus }[];
}

/* -------------------------------------------------------------- Publishing */

/** POST /experiences */
export interface CreateExperienceRequest {
  experienceId: string;
  title: string;
  summary: string;
  domain: string;
  category: string;
  level: Level;
  difficulty: number;
  tags?: string[];
}

/** POST /experiences/{id}/versions */
export interface RegisterVersionRequest {
  manifest: Manifest;
  artifacts: ArtifactDigest[];
  /** Digest of the manifest.json bytes exactly as the CLI will upload them. */
  manifestDigest: { sha256: string; sizeBytes: number };
}

export interface UploadTarget {
  artifactId: string;
  key: string;
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface RegisterVersionResponse {
  experienceId: string;
  version: string;
  status: VersionStatus;
  s3Prefix: string;
  /** One upload per artifact plus one for manifest.json (artifactId = "manifest"). */
  uploads: UploadTarget[];
}

/** POST /publish */
export interface PublishRequest {
  experienceId: string;
  version: string;
}

export interface PublishResponse {
  experienceId: string;
  version: string;
  status: "PUBLISHED";
  publishedAt: string;
  s3Prefix: string;
  artifactCount: number;
  totalBytes: number;
  verified: { artifactId: string; sizeBytes: number; sha256Verified: boolean }[];
  previousPublishedVersion: string | null;
}

/** POST /experiences/{id}/versions/{v}/status */
export interface SetVersionStatusRequest {
  status: Exclude<VersionStatus, "PUBLISHED">;
  note?: string;
}

/** PUT /skills/{skillId} */
export type UpsertSkillRequest = Skill;
