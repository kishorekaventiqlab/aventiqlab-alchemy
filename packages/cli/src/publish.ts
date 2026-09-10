/**
 * `alchemy publish <dir>` — the local -> Alchemy workflow:
 *   validate package -> upsert shipped skills -> register version (get upload URLs)
 *   -> upload manifest + artifacts -> POST /publish -> summary
 */
import path from "node:path";
import type { PublishResponse, RegisterVersionRequest, RegisterVersionResponse, SkillResponse } from "@aventiqlab/alchemy-core";
import { validatePackage, type PackageReport } from "@aventiqlab/alchemy-core/package-validator";
import { unwrap, type Transport } from "./transport.js";

export interface PublishOptions {
  /** Validate and print the plan, but do not call the API. */
  dryRun?: boolean;
  /** Skip upserting skills from <package>/skills/. */
  skipSkills?: boolean;
  /** Register + upload, but stop before POST /publish (leaves a DRAFT for review). */
  draftOnly?: boolean;
  log?: (line: string) => void;
}

export interface PublishSummary {
  experienceId: string;
  version: string;
  status: "DRAFT" | "PUBLISHED" | "DRY_RUN";
  s3Prefix?: string;
  skillsUpserted: string[];
  uploaded: { artifactId: string; key: string; sizeBytes: number }[];
  publication?: PublishResponse;
  warnings: string[];
}

export class PackageInvalidError extends Error {
  constructor(readonly report: PackageReport) {
    super(`package failed validation with ${report.issues.length} issue(s)`);
    this.name = "PackageInvalidError";
  }
}

export async function runPublish(packageDir: string, transport: Transport, opts: PublishOptions = {}): Promise<PublishSummary> {
  const log = opts.log ?? (() => {});
  const report = await validatePackage(packageDir);
  const warnings = report.warnings.map((w) => `${w.path}: ${w.message}`);
  if (!report.ok || !report.manifest || !report.manifestDigest) throw new PackageInvalidError(report);
  const m = report.manifest;
  log(`validated ${m.experienceId}@${m.version}: ${report.artifacts.length} artifact(s), ${report.skills.length} skill(s)`);

  const summary: PublishSummary = { experienceId: m.experienceId, version: m.version, status: "DRY_RUN", skillsUpserted: [], uploaded: [], warnings };
  if (opts.dryRun) return summary;

  if (!opts.skipSkills) {
    for (const s of report.skills) {
      unwrap(await transport.request<SkillResponse>("PUT", `/skills/${s.skillId}`, s), `upsert skill ${s.skillId}`);
      summary.skillsUpserted.push(s.skillId);
      log(`skill ${s.skillId} upserted`);
    }
  }

  const body: RegisterVersionRequest = {
    manifest: m,
    artifacts: report.artifacts.map((a) => ({ artifactId: a.artifactId, sha256: a.sha256, sizeBytes: a.sizeBytes })),
    manifestDigest: report.manifestDigest,
  };
  const reg = unwrap(await transport.request<RegisterVersionResponse>("POST", `/experiences/${m.experienceId}/versions`, body), "register version");
  summary.status = "DRAFT";
  summary.s3Prefix = reg.s3Prefix;
  log(`registered ${reg.experienceId}@${reg.version} as ${reg.status} under s3://…/${reg.s3Prefix}`);

  for (const u of reg.uploads) {
    const local = u.artifactId === "manifest" ? path.join(report.packageDir, "manifest.json") : report.artifacts.find((a) => a.artifactId === u.artifactId)?.absolutePath;
    if (!local) throw new Error(`API returned an upload target for unknown artifact "${u.artifactId}"`);
    const sizeBytes = u.artifactId === "manifest" ? report.manifestDigest.sizeBytes : report.artifacts.find((a) => a.artifactId === u.artifactId)!.sizeBytes;
    await transport.upload(u.url, u.headers, local);
    summary.uploaded.push({ artifactId: u.artifactId, key: u.key, sizeBytes });
    log(`uploaded ${u.artifactId} (${formatBytes(sizeBytes)}) -> ${u.key}`);
  }

  if (opts.draftOnly) return summary;

  const pub = unwrap(await transport.request<PublishResponse>("POST", "/publish", { experienceId: m.experienceId, version: m.version }), "publish");
  summary.status = "PUBLISHED";
  summary.publication = pub;
  log(`published ${pub.experienceId}@${pub.version} at ${pub.publishedAt} (${pub.artifactCount} artifacts, ${formatBytes(pub.totalBytes)})`);
  return summary;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
