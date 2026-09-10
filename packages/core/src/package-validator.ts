/**
 * Validates a Learning Experience package directory on disk. Used by
 * `alchemy validate` and `alchemy publish`. Node-only (uses fs); the API never
 * imports this module.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ArtifactDigest, Manifest, Skill } from "./types.js";
import { validateAgainstSchema, validateManifest, validateSkill, referencedSkillIds, type ValidationIssue } from "./validate.js";

export interface PackageArtifactInfo extends ArtifactDigest {
  path: string;
  absolutePath: string;
  contentType: string;
}

export interface PackageReport {
  ok: boolean;
  packageDir: string;
  manifest?: Manifest;
  manifestDigest?: { sha256: string; sizeBytes: number };
  artifacts: PackageArtifactInfo[];
  skills: Skill[];
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
}

const KIND_JSON_SCHEMA = {
  quiz: "quiz",
  arena: "arena",
  "skill-evaluator": "evaluator",
} as const;

export async function sha256File(absolutePath: string): Promise<{ sha256: string; sizeBytes: number }> {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  await new Promise<void>((resolve, reject) => {
    createReadStream(absolutePath)
      .on("data", (chunk: Buffer | string) => {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        sizeBytes += buf.length;
        hash.update(buf);
      })
      .on("end", resolve)
      .on("error", reject);
  });
  return { sha256: hash.digest("hex"), sizeBytes };
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function validatePackage(packageDir: string): Promise<PackageReport> {
  const dir = path.resolve(packageDir);
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const report: PackageReport = { ok: false, packageDir: dir, artifacts: [], skills: [], issues, warnings };

  // 1. manifest.json exists and parses
  const manifestPath = path.join(dir, "manifest.json");
  let raw: Buffer;
  try {
    raw = await readFile(manifestPath);
  } catch {
    issues.push({ path: "manifest.json", message: `not found in ${dir}` });
    return report;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch (e) {
    issues.push({ path: "manifest.json", message: `invalid JSON: ${(e as Error).message}` });
    return report;
  }

  // 2. schema + semantics
  const mv = validateManifest(parsed);
  if (!mv.ok || !mv.manifest) {
    issues.push(...mv.issues.map((i) => ({ path: `manifest.json${i.path}`, message: i.message })));
    return report;
  }
  const manifest = mv.manifest;
  report.manifest = manifest;
  report.manifestDigest = { sha256: sha256Bytes(raw), sizeBytes: raw.length };

  // package folder name should match experienceId (warning only — the id is authoritative)
  if (path.basename(dir) !== manifest.experienceId) {
    warnings.push({ path: dir, message: `folder name "${path.basename(dir)}" differs from experienceId "${manifest.experienceId}"` });
  }

  // 3. every artifact file exists, is a file, and typed JSON artifacts validate
  for (const [i, a] of manifest.artifacts.entries()) {
    const abs = path.join(dir, a.path);
    if (!abs.startsWith(dir + path.sep)) {
      issues.push({ path: `manifest.json/artifacts/${i}/path`, message: `escapes package dir: ${a.path}` });
      continue;
    }
    let st;
    try {
      st = await stat(abs);
    } catch {
      if (a.required === false) {
        warnings.push({ path: a.path, message: "optional artifact file is missing; it will be skipped" });
        continue;
      }
      issues.push({ path: a.path, message: "required artifact file not found" });
      continue;
    }
    if (!st.isFile()) {
      issues.push({ path: a.path, message: "artifact path is not a file" });
      continue;
    }
    if (st.size === 0) issues.push({ path: a.path, message: "artifact file is empty" });

    const schemaName = (KIND_JSON_SCHEMA as Record<string, "quiz" | "arena" | "evaluator" | undefined>)[a.kind];
    if (schemaName) {
      try {
        const doc = JSON.parse((await readFile(abs)).toString("utf8"));
        const r = validateAgainstSchema(schemaName, doc);
        issues.push(...r.issues.map((x) => ({ path: `${a.path}${x.path}`, message: x.message })));
        if (a.kind === "quiz" && r.ok) checkQuiz(doc as QuizDoc, a.path, issues);
      } catch (e) {
        issues.push({ path: a.path, message: `invalid JSON: ${(e as Error).message}` });
      }
    }

    const digest = await sha256File(abs);
    report.artifacts.push({ artifactId: a.artifactId, path: a.path, absolutePath: abs, contentType: a.contentType, ...digest });
  }

  // 4. optional skills/ directory: every *.json is a Skill
  const skillsDir = path.join(dir, "skills");
  const localSkillIds = new Set<string>();
  try {
    const entries = (await readdir(skillsDir)).filter((f) => f.endsWith(".json")).sort();
    for (const f of entries) {
      const p = path.join(skillsDir, f);
      try {
        const sv = validateSkill(JSON.parse((await readFile(p)).toString("utf8")));
        if (!sv.ok || !sv.skill) {
          issues.push(...sv.issues.map((x) => ({ path: `skills/${f}${x.path}`, message: x.message })));
          continue;
        }
        if (path.basename(f, ".json") !== sv.skill.skillId) {
          warnings.push({ path: `skills/${f}`, message: `file name differs from skillId "${sv.skill.skillId}"` });
        }
        report.skills.push(sv.skill);
        localSkillIds.add(sv.skill.skillId);
      } catch (e) {
        issues.push({ path: `skills/${f}`, message: `invalid JSON: ${(e as Error).message}` });
      }
    }
  } catch {
    /* no skills dir — fine, skills may already exist in Alchemy */
  }

  // 5. surface which referenced skills are not shipped locally (publish verifies they exist remotely)
  for (const id of referencedSkillIds(manifest)) {
    if (!localSkillIds.has(id)) warnings.push({ path: `skills/${id}.json`, message: `skill "${id}" is referenced but not shipped in skills/; it must already exist in Alchemy` });
  }

  report.ok = issues.length === 0;
  return report;
}

interface QuizDoc {
  questions: { id: string; type: string; options: { id: string }[]; correctOptionIds: string[] }[];
}

function checkQuiz(q: QuizDoc, at: string, issues: ValidationIssue[]): void {
  const ids = new Set<string>();
  q.questions.forEach((qq, i) => {
    if (ids.has(qq.id)) issues.push({ path: `${at}/questions/${i}/id`, message: `duplicate question id "${qq.id}"` });
    ids.add(qq.id);
    const optIds = new Set(qq.options.map((o) => o.id));
    if (optIds.size !== qq.options.length) issues.push({ path: `${at}/questions/${i}/options`, message: "duplicate option ids" });
    for (const c of qq.correctOptionIds) {
      if (!optIds.has(c)) issues.push({ path: `${at}/questions/${i}/correctOptionIds`, message: `unknown option "${c}"` });
    }
    if ((qq.type === "single" || qq.type === "true_false") && qq.correctOptionIds.length !== 1) {
      issues.push({ path: `${at}/questions/${i}/correctOptionIds`, message: `type "${qq.type}" needs exactly one correct option` });
    }
    if (qq.type === "true_false" && qq.options.length !== 2) {
      issues.push({ path: `${at}/questions/${i}/options`, message: "true_false needs exactly two options" });
    }
  });
}
