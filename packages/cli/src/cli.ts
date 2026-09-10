#!/usr/bin/env -S node --import tsx
/**
 * alchemy — publish learning experiences from the desktop to Alchemy.
 *
 *   alchemy validate <package-dir>
 *   alchemy publish  <package-dir> [--dry-run] [--draft-only] [--skip-skills] [--json]
 *   alchemy get      <experienceId> [--version X.Y.Z]
 *
 * Configuration (env): ALCHEMY_API_URL, ALCHEMY_PUBLISH_TOKEN (publish), ALCHEMY_READ_TOKEN (get).
 * The CLI never holds AWS credentials — every byte goes through the API or a presigned URL.
 */
import { parseArgs } from "node:util";
import type { ExperienceResponse } from "@aventiqlab/alchemy-core";
import { validatePackage } from "@aventiqlab/alchemy-core/package-validator";
import { PackageInvalidError, runPublish } from "./publish.js";
import { ApiRequestError, HttpTransport, unwrap } from "./transport.js";

const USAGE = `usage:
  alchemy validate <package-dir>
  alchemy publish  <package-dir> [--dry-run] [--draft-only] [--skip-skills] [--json]
  alchemy get      <experienceId> [--version X.Y.Z] [--json]

env: ALCHEMY_API_URL, ALCHEMY_PUBLISH_TOKEN, ALCHEMY_READ_TOKEN`;

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing ${name}`);
    process.exit(2);
  }
  return v;
}

function printReport(report: Awaited<ReturnType<typeof validatePackage>>): void {
  for (const w of report.warnings) console.log(`  warn  ${w.path}: ${w.message}`);
  for (const i of report.issues) console.log(`  error ${i.path}: ${i.message}`);
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      "draft-only": { type: "boolean", default: false },
      "skip-skills": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      version: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [cmd, arg] = positionals;
  if (values.help || !cmd) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }

  if (cmd === "validate") {
    if (!arg) return usage();
    const report = await validatePackage(arg);
    if (values.json) console.log(JSON.stringify({ ok: report.ok, issues: report.issues, warnings: report.warnings, artifacts: report.artifacts.map(({ absolutePath: _a, ...rest }) => rest), skills: report.skills.map((s) => s.skillId) }, null, 2));
    else {
      console.log(`${report.ok ? "OK " : "FAIL"} ${report.manifest?.experienceId ?? "?"}@${report.manifest?.version ?? "?"} — ${report.artifacts.length} artifact(s), ${report.skills.length} skill(s), ${report.issues.length} issue(s), ${report.warnings.length} warning(s)`);
      printReport(report);
    }
    return report.ok ? 0 : 1;
  }

  if (cmd === "publish") {
    if (!arg) return usage();
    const transport = values["dry-run"] ? undefined : new HttpTransport(env("ALCHEMY_API_URL"), env("ALCHEMY_PUBLISH_TOKEN"));
    try {
      const summary = await runPublish(arg, transport ?? { request: async () => { throw new Error("dry run"); }, upload: async () => { throw new Error("dry run"); } }, {
        dryRun: values["dry-run"],
        draftOnly: values["draft-only"],
        skipSkills: values["skip-skills"],
        log: values.json ? undefined : (l) => console.log(`  ${l}`),
      });
      if (values.json) console.log(JSON.stringify(summary, null, 2));
      else {
        console.log(`${summary.status} ${summary.experienceId}@${summary.version}${summary.s3Prefix ? `  s3 prefix: ${summary.s3Prefix}` : ""}`);
        for (const w of summary.warnings) console.log(`  warn  ${w}`);
      }
      return 0;
    } catch (e) {
      if (e instanceof PackageInvalidError) {
        console.log(`FAIL ${arg}: ${e.message}`);
        printReport(e.report);
        return 1;
      }
      if (e instanceof ApiRequestError) {
        console.error(`API error ${e.status} ${e.code}: ${e.message}`);
        if (e.details !== undefined) console.error(JSON.stringify(e.details, null, 2));
        return 1;
      }
      throw e;
    }
  }

  if (cmd === "get") {
    if (!arg) return usage();
    const token = process.env.ALCHEMY_READ_TOKEN ?? process.env.ALCHEMY_PUBLISH_TOKEN;
    if (!token) return env("ALCHEMY_READ_TOKEN") ? 0 : 2;
    const transport = new HttpTransport(env("ALCHEMY_API_URL"), token);
    const q = values.version ? `?version=${encodeURIComponent(values.version)}` : "";
    try {
      const res = unwrap(await transport.request<ExperienceResponse>("GET", `/experiences/${arg}${q}`), "get experience");
      if (values.json) console.log(JSON.stringify(res, null, 2));
      else {
        const e = res.experience;
        console.log(`${e.experienceId}  ${e.title}  [${e.status}] latest published: ${e.latestPublishedVersion ?? "-"}`);
        if (res.version) {
          console.log(`version ${res.version.version} (${res.version.status})  prefix ${res.version.s3Prefix}`);
          console.log(`skills taught: ${res.version.manifest.skills.taught.map((s) => `${s.skillId}@${s.targetLevel}`).join(", ")}`);
          for (const a of res.version.artifacts) console.log(`  ${a.kind.padEnd(15)} ${a.artifactId.padEnd(22)} ${a.path}`);
        }
      }
      return 0;
    } catch (e) {
      if (e instanceof ApiRequestError) {
        console.error(`API error ${e.status} ${e.code}: ${e.message}`);
        return 1;
      }
      throw e;
    }
  }

  return usage();
}

function usage(): number {
  console.log(USAGE);
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  },
);
