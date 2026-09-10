/**
 * Pure mappers from domain objects to DynamoDB items (plain JS objects; the API
 * marshals them). Keeping them here means the item shape is testable without
 * AWS and documented in one place — see docs/dynamodb-data-model.md.
 */
import { createHash } from "node:crypto";
import type { ArtifactRef, ExperienceSummary, VersionSummary } from "./api-contract.js";
import { ddb, ENTITY } from "./keys.js";
import { referencedSkillIds } from "./validate.js";
import type { ArtifactDigest, CompetencyLevel, Manifest, Skill, SkillRelation, VersionStatus } from "./types.js";

export interface BaseItem {
  PK: string;
  SK: string;
  entityType: string;
  createdAt: string;
  updatedAt: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
}

export interface ExperienceMetaItem extends BaseItem {
  entityType: "EXPERIENCE";
  experienceId: string;
  title: string;
  summary: string;
  domain: string;
  category: string;
  level: string;
  difficulty: number;
  tags: string[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  latestVersion: string | null;
  latestPublishedVersion: string | null;
  latestPublishedAt: string | null;
}

export interface VersionItem extends BaseItem {
  entityType: "EXPERIENCE_VERSION";
  experienceId: string;
  version: string;
  status: VersionStatus;
  s3Prefix: string;
  manifest: Manifest;
  manifestSha256: string;
  manifestSizeBytes: number;
  contentHash: string;
  artifactCount: number;
  skillIds: string[];
  prerequisiteIds: string[];
  publishedAt?: string;
  statusHistory: { from: VersionStatus | null; to: VersionStatus; at: string; actor: string; note?: string }[];
}

export interface ArtifactItem extends BaseItem {
  entityType: "ARTIFACT";
  experienceId: string;
  version: string;
  artifactId: string;
  kind: string;
  path: string;
  s3Key: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  title?: string;
  durationSeconds?: number;
  language?: string;
  skillIds?: string[];
  verifiedAt?: string;
  sha256Verified?: boolean;
  etag?: string;
}

export interface SkillEdgeItem extends BaseItem {
  entityType: "EXPERIENCE_SKILL";
  experienceId: string;
  version: string;
  skillId: string;
  relation: SkillRelation;
  level: CompetencyLevel;
  versionStatus: VersionStatus;
}

export interface SkillItem extends BaseItem {
  entityType: "SKILL";
  skillId: string;
  skill: Skill;
  domain: string;
}

export interface PublicationItem extends BaseItem {
  entityType: "PUBLICATION";
  experienceId: string;
  version: string;
  from: VersionStatus | null;
  to: VersionStatus;
  actor: string;
  note?: string;
  artifactCount?: number;
  totalBytes?: number;
}

export function experienceMetaItem(
  m: Pick<Manifest, "experienceId" | "title" | "summary" | "domain" | "category" | "level" | "difficulty" | "tags">,
  state: {
    status: ExperienceMetaItem["status"];
    latestVersion: string | null;
    latestPublishedVersion: string | null;
    latestPublishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  },
): ExperienceMetaItem {
  return {
    PK: ddb.experiencePk(m.experienceId),
    SK: ddb.metaSk(),
    entityType: ENTITY.EXPERIENCE,
    GSI1PK: ddb.gsi1ExperiencePk(),
    GSI1SK: ddb.gsi1ExperienceSk(m.domain, m.experienceId),
    experienceId: m.experienceId,
    title: m.title,
    summary: m.summary,
    domain: m.domain,
    category: m.category,
    level: m.level,
    difficulty: m.difficulty,
    tags: m.tags ?? [],
    ...state,
  };
}

/** Stable identity of a version's bytes. Order-independent over artifacts. */
export function contentHash(manifestSha256: string, digests: ArtifactDigest[]): string {
  const h = createHash("sha256");
  h.update(`manifest:${manifestSha256}\n`);
  for (const d of [...digests].sort((a, b) => a.artifactId.localeCompare(b.artifactId))) h.update(`${d.artifactId}:${d.sha256}\n`);
  return h.digest("hex");
}

export function versionItem(
  m: Manifest,
  args: { s3Prefix: string; manifestSha256: string; manifestSizeBytes: number; digests: ArtifactDigest[]; now: string; actor: string; existing?: VersionItem },
): VersionItem {
  const status: VersionStatus = args.existing?.status ?? "DRAFT";
  const history = args.existing?.statusHistory ?? [{ from: null, to: "DRAFT" as const, at: args.now, actor: args.actor }];
  return {
    PK: ddb.experiencePk(m.experienceId),
    SK: ddb.versionSk(m.version),
    entityType: ENTITY.EXPERIENCE_VERSION,
    experienceId: m.experienceId,
    version: m.version,
    status,
    s3Prefix: args.s3Prefix,
    manifest: m,
    manifestSha256: args.manifestSha256,
    manifestSizeBytes: args.manifestSizeBytes,
    contentHash: contentHash(args.manifestSha256, args.digests),
    artifactCount: m.artifacts.length,
    skillIds: referencedSkillIds(m),
    prerequisiteIds: m.prerequisites.map((p) => p.experienceId),
    statusHistory: history,
    createdAt: args.existing?.createdAt ?? args.now,
    updatedAt: args.now,
  };
}

export function artifactItems(m: Manifest, digests: ArtifactDigest[], s3Prefix: string, now: string): ArtifactItem[] {
  const byId = new Map(digests.map((d) => [d.artifactId, d]));
  return m.artifacts.map((a) => {
    const d = byId.get(a.artifactId);
    if (!d) throw new Error(`missing digest for artifact "${a.artifactId}"`);
    const item: ArtifactItem = {
      PK: ddb.experiencePk(m.experienceId),
      SK: ddb.artifactSk(m.version, a.artifactId),
      entityType: ENTITY.ARTIFACT,
      experienceId: m.experienceId,
      version: m.version,
      artifactId: a.artifactId,
      kind: a.kind,
      path: a.path,
      s3Key: `${s3Prefix}${a.path}`,
      contentType: a.contentType,
      sizeBytes: d.sizeBytes,
      sha256: d.sha256,
      createdAt: now,
      updatedAt: now,
    };
    if (a.title !== undefined) item.title = a.title;
    if (a.durationSeconds !== undefined) item.durationSeconds = a.durationSeconds;
    if (a.language !== undefined) item.language = a.language;
    if (a.skillIds !== undefined) item.skillIds = a.skillIds;
    return item;
  });
}

export function skillEdgeItems(m: Manifest, versionStatus: VersionStatus, now: string): SkillEdgeItem[] {
  const mk = (skillId: string, relation: SkillRelation, level: CompetencyLevel): SkillEdgeItem => ({
    PK: ddb.experiencePk(m.experienceId),
    SK: ddb.skillEdgeSk(m.version, relation, skillId),
    entityType: ENTITY.EXPERIENCE_SKILL,
    GSI2PK: ddb.gsi2SkillEdgePk(skillId),
    GSI2SK: ddb.gsi2SkillEdgeSk(relation, m.experienceId, m.version),
    experienceId: m.experienceId,
    version: m.version,
    skillId,
    relation,
    level,
    versionStatus,
    createdAt: now,
    updatedAt: now,
  });
  return [
    ...m.skills.taught.map((s) => mk(s.skillId, "TAUGHT", s.targetLevel)),
    ...m.skills.assessed.map((s) => mk(s.skillId, "ASSESSED", s.level)),
    ...m.skills.required.map((s) => mk(s.skillId, "REQUIRED", s.minimumLevel)),
  ];
}

export function skillItem(skill: Skill, now: string, existingCreatedAt?: string): SkillItem {
  const item: SkillItem = {
    PK: ddb.skillPk(skill.skillId),
    SK: ddb.metaSk(),
    entityType: ENTITY.SKILL,
    GSI1PK: ddb.gsi1SkillPk(),
    GSI1SK: ddb.gsi1SkillSk(skill.domain, skill.skillId),
    skillId: skill.skillId,
    domain: skill.domain,
    skill,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
  };
  if (skill.parentSkill) {
    item.GSI2PK = ddb.gsi2SkillParentPk(skill.parentSkill);
    item.GSI2SK = ddb.gsi2SkillParentSk(skill.skillId);
  }
  return item;
}

export function publicationItem(args: {
  experienceId: string;
  version: string;
  from: VersionStatus | null;
  to: VersionStatus;
  actor: string;
  now: string;
  note?: string;
  artifactCount?: number;
  totalBytes?: number;
}): PublicationItem {
  const item: PublicationItem = {
    PK: ddb.experiencePk(args.experienceId),
    SK: ddb.publicationSk(args.now, args.version),
    entityType: ENTITY.PUBLICATION,
    experienceId: args.experienceId,
    version: args.version,
    from: args.from,
    to: args.to,
    actor: args.actor,
    createdAt: args.now,
    updatedAt: args.now,
  };
  if (args.note !== undefined) item.note = args.note;
  if (args.artifactCount !== undefined) item.artifactCount = args.artifactCount;
  if (args.totalBytes !== undefined) item.totalBytes = args.totalBytes;
  return item;
}

/* ------------------------------------------------- item -> API projections */

export function toExperienceSummary(i: ExperienceMetaItem): ExperienceSummary {
  return {
    experienceId: i.experienceId,
    title: i.title,
    summary: i.summary,
    domain: i.domain,
    category: i.category,
    level: i.level as ExperienceSummary["level"],
    difficulty: i.difficulty,
    tags: i.tags,
    status: i.status,
    latestVersion: i.latestVersion,
    latestPublishedVersion: i.latestPublishedVersion,
    latestPublishedAt: i.latestPublishedAt ?? null,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

export function toVersionSummary(i: VersionItem): VersionSummary {
  const out: VersionSummary = {
    experienceId: i.experienceId,
    version: i.version,
    status: i.status,
    s3Prefix: i.s3Prefix,
    contentHash: i.contentHash,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
  if (i.publishedAt) out.publishedAt = i.publishedAt;
  if (i.manifest.changelog) out.changelog = i.manifest.changelog;
  return out;
}

export function artifactUrlPath(experienceId: string, version: string, artifactId: string): string {
  return `/experiences/${experienceId}/versions/${version}/artifacts/${artifactId}/url`;
}

export function toArtifactRef(i: ArtifactItem): ArtifactRef {
  const ref: ArtifactRef = {
    artifactId: i.artifactId,
    kind: i.kind as ArtifactRef["kind"],
    path: i.path,
    contentType: i.contentType,
    sizeBytes: i.sizeBytes,
    sha256: i.sha256,
    urlPath: artifactUrlPath(i.experienceId, i.version, i.artifactId),
  };
  if (i.title !== undefined) ref.title = i.title;
  if (i.durationSeconds !== undefined) ref.durationSeconds = i.durationSeconds;
  if (i.language !== undefined) ref.language = i.language;
  if (i.skillIds !== undefined) ref.skillIds = i.skillIds;
  return ref;
}
