import { padSemver } from "./semver.js";

/**
 * S3 key layout — deterministic, version-aware, human-readable.
 *
 *   {domain}/{level}/{experienceId}/{version}/manifest.json
 *   {domain}/{level}/{experienceId}/{version}/video/…
 *   {domain}/{level}/{experienceId}/{version}/reading/…
 *   {domain}/{level}/{experienceId}/{version}/quiz/…
 *   {domain}/{level}/{experienceId}/{version}/arena/…
 *   {domain}/{level}/{experienceId}/{version}/evaluator/…
 *   {domain}/{level}/{experienceId}/{version}/assets/…
 *
 * `level` is lower-cased (FOUNDATION -> foundation). The prefix is recorded on
 * the EXPERIENCE_VERSION item, so a later version that changes level simply
 * lives under a different prefix — nothing is moved.
 */
export function versionPrefix(domain: string, level: string, experienceId: string, version: string): string {
  return `${domain}/${level.toLowerCase()}/${experienceId}/${version}/`;
}

export function manifestKey(prefix: string): string {
  return `${prefix}manifest.json`;
}

export function artifactKey(prefix: string, relativePath: string): string {
  if (relativePath.startsWith("/") || relativePath.includes("..")) {
    throw new Error(`unsafe artifact path: ${relativePath}`);
  }
  return `${prefix}${relativePath}`;
}

/* ---------------------------------------------------------------- DynamoDB */

export const ENTITY = {
  EXPERIENCE: "EXPERIENCE",
  EXPERIENCE_VERSION: "EXPERIENCE_VERSION",
  ARTIFACT: "ARTIFACT",
  SKILL: "SKILL",
  EXPERIENCE_SKILL: "EXPERIENCE_SKILL",
  PUBLICATION: "PUBLICATION",
} as const;
export type EntityType = (typeof ENTITY)[keyof typeof ENTITY];

export const ddb = {
  /** PK for everything belonging to one experience. */
  experiencePk: (experienceId: string) => `EXP#${experienceId}`,
  metaSk: () => "META",
  versionSk: (version: string) => `VER#${padSemver(version)}`,
  artifactSk: (version: string, artifactId: string) => `VER#${padSemver(version)}#ART#${artifactId}`,
  skillEdgeSk: (version: string, relation: string, skillId: string) =>
    `VER#${padSemver(version)}#SKILL#${relation}#${skillId}`,
  publicationSk: (isoTimestamp: string, version: string) => `PUB#${isoTimestamp}#${padSemver(version)}`,

  skillPk: (skillId: string) => `SKILL#${skillId}`,

  /** GSI1: list-by-type, sorted by domain then id. */
  gsi1ExperiencePk: () => "EXPERIENCE",
  gsi1ExperienceSk: (domain: string, experienceId: string) => `${domain}#${experienceId}`,
  gsi1SkillPk: () => "SKILL",
  gsi1SkillSk: (domain: string, skillId: string) => `${domain}#${skillId}`,

  /** GSI2: reverse lookups — experiences by skill, skills by parent. */
  gsi2SkillEdgePk: (skillId: string) => `SKILL#${skillId}`,
  gsi2SkillEdgeSk: (relation: string, experienceId: string, version: string) =>
    `${relation}#${experienceId}#${padSemver(version)}`,
  gsi2SkillParentPk: (parentSkillId: string) => `SKILLPARENT#${parentSkillId}`,
  gsi2SkillParentSk: (skillId: string) => skillId,
} as const;
