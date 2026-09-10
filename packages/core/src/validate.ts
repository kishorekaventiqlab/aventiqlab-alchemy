import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import * as addFormatsNs from "ajv-formats";
import type { FormatsPlugin } from "ajv-formats";

import manifestSchema from "../../../schemas/manifest.schema.json" with { type: "json" };
import skillSchema from "../../../schemas/skill.schema.json" with { type: "json" };
import quizSchema from "../../../schemas/quiz.schema.json" with { type: "json" };
import evaluatorSchema from "../../../schemas/evaluator.schema.json" with { type: "json" };
import arenaSchema from "../../../schemas/arena-definition.schema.json" with { type: "json" };
import { ARTIFACT_FOLDER, EVIDENCE_SOURCE, type ArtifactKind, type Manifest, type Skill } from "./types.js";

export interface ValidationIssue {
  /** JSON pointer-ish location, e.g. "/artifacts/2/path". */
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

// ajv-formats is CJS with `module.exports = plugin` + `.default`; namespace-import it so both Node ESM and esbuild resolve the same way.
// At runtime the namespace's `default` IS the plugin function (module.exports = plugin); TS types it as the module.
const addFormats = (addFormatsNs as unknown as { default: FormatsPlugin }).default;
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

const compiled = {
  manifest: ajv.compile(manifestSchema),
  skill: ajv.compile(skillSchema),
  quiz: ajv.compile(quizSchema),
  evaluator: ajv.compile(evaluatorSchema),
  arena: ajv.compile(arenaSchema),
} satisfies Record<string, ValidateFunction>;

export type SchemaName = keyof typeof compiled;

function ajvIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((e) => ({
    path: e.instancePath || "/",
    message: e.keyword === "additionalProperties" ? `${e.message}: ${String(e.params.additionalProperty)}` : (e.message ?? e.keyword),
  }));
}

/** Pure JSON Schema check, no semantics. */
export function validateAgainstSchema(name: SchemaName, value: unknown): ValidationResult {
  const fn = compiled[name];
  const ok = fn(value);
  return { ok: ok === true, issues: ok ? [] : ajvIssues(fn.errors) };
}

/**
 * Schema + semantic validation of a manifest. Semantic rules cover what JSON
 * Schema cannot express: uniqueness across arrays, cross-references between
 * sections, and kind/folder agreement.
 */
export function validateManifest(value: unknown): ValidationResult & { manifest?: Manifest } {
  const schema = validateAgainstSchema("manifest", value);
  if (!schema.ok) return schema;
  const m = value as Manifest;
  const issues: ValidationIssue[] = [];
  const push = (path: string, message: string) => issues.push({ path, message });

  // artifacts: unique ids, unique paths, folder matches kind
  const artifactIds = new Set<string>();
  const paths = new Set<string>();
  const kindsPresent = new Set<ArtifactKind>();
  m.artifacts.forEach((a, i) => {
    if (artifactIds.has(a.artifactId)) push(`/artifacts/${i}/artifactId`, `duplicate artifactId "${a.artifactId}"`);
    artifactIds.add(a.artifactId);
    if (paths.has(a.path)) push(`/artifacts/${i}/path`, `duplicate path "${a.path}"`);
    paths.add(a.path);
    const folder = a.path.split("/")[0];
    if (folder !== ARTIFACT_FOLDER[a.kind]) {
      push(`/artifacts/${i}/path`, `kind "${a.kind}" must live under "${ARTIFACT_FOLDER[a.kind]}/" (got "${folder}/")`);
    }
    if (a.path.toLowerCase() === "manifest.json") push(`/artifacts/${i}/path`, "manifest.json is not an artifact");
    kindsPresent.add(a.kind);
  });

  const requireArtifact = (path: string, id: string, kind?: ArtifactKind) => {
    const found = m.artifacts.find((a) => a.artifactId === id);
    if (!found) return push(path, `unknown artifactId "${id}"`);
    if (kind && found.kind !== kind) push(path, `artifact "${id}" must be kind "${kind}" (is "${found.kind}")`);
  };

  // completion + mastery references
  m.completionCriteria.requiredArtifactIds.forEach((id, i) => requireArtifact(`/completionCriteria/requiredArtifactIds/${i}`, id));
  if (m.completionCriteria.quiz) requireArtifact("/completionCriteria/quiz/artifactId", m.completionCriteria.quiz.artifactId, "quiz");
  if (m.masteryCriteria.evaluator) requireArtifact("/masteryCriteria/evaluator/artifactId", m.masteryCriteria.evaluator.artifactId, "skill-evaluator");
  if (m.masteryCriteria.arena) requireArtifact("/masteryCriteria/arena/artifactId", m.masteryCriteria.arena.artifactId, "arena");
  m.masteryCriteria.evidenceRequired?.forEach((ev, i) => {
    if (!kindsPresent.has(EVIDENCE_SOURCE[ev])) push(`/masteryCriteria/evidenceRequired/${i}`, `evidence "${ev}" requires an artifact of kind "${EVIDENCE_SOURCE[ev]}"`);
  });

  // skills: unique per section, assessed evidence backed by artifacts
  const uniq = (section: "taught" | "assessed" | "required") => {
    const seen = new Set<string>();
    m.skills[section].forEach((s, i) => {
      if (seen.has(s.skillId)) push(`/skills/${section}/${i}/skillId`, `duplicate skillId "${s.skillId}" in skills.${section}`);
      seen.add(s.skillId);
    });
    return seen;
  };
  const taught = uniq("taught");
  uniq("assessed");
  const required = uniq("required");
  for (const id of required) if (taught.has(id)) push("/skills/required", `skill "${id}" is both required and taught`);
  m.skills.assessed.forEach((s, i) =>
    s.evidence.forEach((ev, j) => {
      if (!kindsPresent.has(EVIDENCE_SOURCE[ev])) push(`/skills/assessed/${i}/evidence/${j}`, `evidence "${ev}" requires an artifact of kind "${EVIDENCE_SOURCE[ev]}"`);
    }),
  );

  // learning objectives: unique ids; skill refs must be declared somewhere in skills.*
  const declared = new Set([...taught, ...m.skills.assessed.map((s) => s.skillId), ...required]);
  const loIds = new Set<string>();
  m.learningObjectives.forEach((lo, i) => {
    if (loIds.has(lo.id)) push(`/learningObjectives/${i}/id`, `duplicate learning objective id "${lo.id}"`);
    loIds.add(lo.id);
    lo.skillIds?.forEach((sid, j) => {
      if (!declared.has(sid)) push(`/learningObjectives/${i}/skillIds/${j}`, `skill "${sid}" is not declared in skills.taught/assessed/required`);
    });
  });
  m.artifacts.forEach((a, i) =>
    a.skillIds?.forEach((sid, j) => {
      if (!declared.has(sid)) push(`/artifacts/${i}/skillIds/${j}`, `skill "${sid}" is not declared in skills.taught/assessed/required`);
    }),
  );

  // prerequisites: no self reference, unique
  const prereqs = new Set<string>();
  m.prerequisites.forEach((p, i) => {
    if (p.experienceId === m.experienceId) push(`/prerequisites/${i}/experienceId`, "an experience cannot be its own prerequisite");
    if (prereqs.has(p.experienceId)) push(`/prerequisites/${i}/experienceId`, `duplicate prerequisite "${p.experienceId}"`);
    prereqs.add(p.experienceId);
  });

  const yrs = m.targetAudience.experienceYears;
  if (yrs && yrs.min > yrs.max) push("/targetAudience/experienceYears", "min must be <= max");

  if (m.skills.taught.length === 0) push("/skills/taught", "an experience must teach at least one skill");

  return { ok: issues.length === 0, issues, manifest: issues.length === 0 ? m : undefined };
}

export function validateSkill(value: unknown): ValidationResult & { skill?: Skill } {
  const schema = validateAgainstSchema("skill", value);
  if (!schema.ok) return schema;
  const s = value as Skill;
  const issues: ValidationIssue[] = [];
  if (s.parentSkill === s.skillId) issues.push({ path: "/parentSkill", message: "a skill cannot be its own parent" });
  if (s.childSkills?.includes(s.skillId)) issues.push({ path: "/childSkills", message: "a skill cannot be its own child" });
  if (s.parentSkill && s.childSkills?.includes(s.parentSkill)) issues.push({ path: "/childSkills", message: "parent cannot also be a child" });
  const levels = new Set<string>();
  s.competencyLevels.forEach((c, i) => {
    if (levels.has(c.level)) issues.push({ path: `/competencyLevels/${i}/level`, message: `duplicate competency level "${c.level}"` });
    levels.add(c.level);
  });
  if (s.status === "DEPRECATED" && !s.replacedBy) issues.push({ path: "/replacedBy", message: "a DEPRECATED skill should name its replacement" });
  return { ok: issues.length === 0, issues, skill: issues.length === 0 ? s : undefined };
}

/** All skillIds a manifest references, in every section. */
export function referencedSkillIds(m: Manifest): string[] {
  const ids = new Set<string>();
  for (const s of m.skills.taught) ids.add(s.skillId);
  for (const s of m.skills.assessed) ids.add(s.skillId);
  for (const s of m.skills.required) ids.add(s.skillId);
  return [...ids].sort();
}
