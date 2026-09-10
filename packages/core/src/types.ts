/**
 * Shared TypeScript view of the JSON Schemas in /schemas.
 * The schemas are the source of truth; these types exist so the API, CLI and
 * infra tests share one vocabulary. Keep them in sync by hand (there is no
 * codegen step — the shapes are small).
 */

export type Level = "FOUNDATION" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";

/** Mirrors the AventiqLab platform's DepthLevel scale (minus `none`). */
export type CompetencyLevel = "exposure" | "knowledge" | "hands_on" | "production" | "architecture";
export const COMPETENCY_LEVELS: readonly CompetencyLevel[] = [
  "exposure",
  "knowledge",
  "hands_on",
  "production",
  "architecture",
] as const;

export type AssessmentDimension = "KNOW" | "UNDERSTAND" | "BUILD" | "OPERATE" | "TROUBLESHOOT" | "DESIGN" | "EXPLAIN";

export type EvidenceKind = "quiz" | "evaluator" | "arena" | "reading" | "video";

export type ArtifactKind = "video" | "reading" | "quiz" | "arena" | "skill-evaluator" | "asset";

/** Folder each artifact kind must live under inside a package. */
export const ARTIFACT_FOLDER: Record<ArtifactKind, string> = {
  video: "video",
  reading: "reading",
  quiz: "quiz",
  arena: "arena",
  "skill-evaluator": "evaluator",
  asset: "assets",
};

/** Which artifact kinds can produce which evidence kinds. */
export const EVIDENCE_SOURCE: Record<EvidenceKind, ArtifactKind> = {
  quiz: "quiz",
  evaluator: "skill-evaluator",
  arena: "arena",
  reading: "reading",
  video: "video",
};

export interface ManifestArtifact {
  artifactId: string;
  kind: ArtifactKind;
  path: string;
  contentType: string;
  title?: string;
  required?: boolean;
  durationSeconds?: number;
  language?: string;
  skillIds?: string[];
}

export interface Manifest {
  manifestVersion: "1";
  experienceId: string;
  version: string;
  title: string;
  summary: string;
  description?: string;
  domain: string;
  category: string;
  level: Level;
  difficulty: number;
  estimatedMinutes?: number;
  tags?: string[];
  placement?: { program?: string; track?: string; module?: string; order?: number };
  skills: {
    taught: { skillId: string; targetLevel: CompetencyLevel; primary?: boolean }[];
    assessed: { skillId: string; level: CompetencyLevel; evidence: EvidenceKind[] }[];
    required: { skillId: string; minimumLevel: CompetencyLevel }[];
  };
  prerequisites: { experienceId: string; optional?: boolean; reason?: string }[];
  targetAudience: {
    profiles: string[];
    experienceYears?: { min: number; max: number };
    notes?: string;
  };
  learningObjectives: { id: string; statement: string; skillIds?: string[]; dimension?: AssessmentDimension }[];
  artifacts: ManifestArtifact[];
  completionCriteria: {
    requiredArtifactIds: string[];
    quiz?: { artifactId: string; passingScorePercent: number };
  };
  masteryCriteria: {
    evaluator?: { artifactId: string; minimumLevel: CompetencyLevel };
    arena?: { artifactId: string; successConditions?: string[] };
    evidenceRequired?: EvidenceKind[];
  };
  participation?: "mandatory" | "optional";
  authors?: { name: string; email?: string }[];
  changelog?: string;
  extensions?: Record<string, unknown>;
}

export interface Skill {
  skillId: string;
  name: string;
  domain: string;
  description: string;
  parentSkill?: string;
  childSkills?: string[];
  aliases?: string[];
  competencyLevels: { level: CompetencyLevel; descriptor: string; indicators?: string[] }[];
  assessmentDimensions: AssessmentDimension[];
  tags?: string[];
  status?: "ACTIVE" | "DEPRECATED";
  replacedBy?: string;
  externalRefs?: Record<string, string>;
}

/** Content lifecycle of one experience version. */
export type VersionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PUBLISHED" | "ARCHIVED";

/** Digest the CLI computes locally and the API verifies after upload. */
export interface ArtifactDigest {
  artifactId: string;
  sha256: string;
  sizeBytes: number;
}

export type SkillRelation = "TAUGHT" | "ASSESSED" | "REQUIRED";
