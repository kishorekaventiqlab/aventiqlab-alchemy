/**
 * Validates a rendered .mp4 against a mechanical checklist:
 *   1. Audio track exists.
 *   2. Audio is not silent (RMS above a floor, sampled across several points).
 *   3. Video duration matches the beat data's expected total.
 *   4. No beat's audio file is missing (every beat with an audioFile has a
 *      corresponding manifest entry with durationSeconds > 0).
 *   5. No beat's measured audio duration exceeds its allocated `duration`
 *      window (which would mean narration gets cut off / overlaps the next
 *      beat).
 *   6. Video resolution/codec match the expected values (1920x1080, h264).
 *
 * This does not replace a human watching the video or the repo's existing
 * schema/cross-reference validation (docs/validation-guide.md) - it's a
 * mechanical, automatable subset that's fast to run after every render.
 *
 * Usage:
 *   npx tsx scripts/validate-render.ts out/inference-under-load-video.mp4 \
 *     --data inferenceUnderLoadScript --manifest public/audio/inferenceUnderLoadScript/inferenceUnderLoadScript.manifest.json
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

type Check = { name: string; pass: boolean; detail: string };

const parseArgs = (argv: string[]) => {
  const args: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    } else {
      positional.push(argv[i]);
    }
  }
  return { mp4Path: positional[0], dataFileName: args.data, manifestPath: args.manifest };
};

const findFfprobe = (): string => {
  const candidates = [
    join(repoRoot, "node_modules/@remotion/compositor-darwin-arm64/ffprobe"),
    join(repoRoot, "node_modules/@remotion/compositor-darwin-x64/ffprobe"),
    join(repoRoot, "node_modules/@remotion/compositor-linux-x64-gnu/ffprobe"),
    join(repoRoot, "node_modules/@remotion/compositor-win32-x64/ffprobe.exe"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "ffprobe"; // fall back to a system ffprobe
};

const findFfmpeg = (): string => findFfprobe().replace(/ffprobe(\.exe)?$/, (m) => (m.includes(".exe") ? "ffmpeg.exe" : "ffmpeg"));

const ffprobeJson = (ffprobe: string, mp4Path: string): any => {
  const dylibDir = dirname(ffprobe);
  const out = execFileSync(ffprobe, [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    mp4Path,
  ], { env: { ...process.env, DYLD_LIBRARY_PATH: dylibDir, LD_LIBRARY_PATH: dylibDir } });
  return JSON.parse(out.toString());
};

const rmsAt = (ffmpeg: string, mp4Path: string, startSeconds: number, durationSeconds: number): number => {
  const dylibDir = dirname(ffmpeg);
  const tmpWav = join(repoRoot, "out", `.validate-rms-${startSeconds}.wav`);
  execFileSync(ffmpeg, [
    "-v", "error", "-y", "-ss", String(startSeconds), "-t", String(durationSeconds),
    "-i", mp4Path, "-vn", "-acodec", "pcm_s16le", "-ar", "22050", "-ac", "1", tmpWav,
  ], { env: { ...process.env, DYLD_LIBRARY_PATH: dylibDir, LD_LIBRARY_PATH: dylibDir } });

  const buffer = readFileSync(tmpWav);
  // 44-byte canonical WAV header, then 16-bit PCM samples.
  const dataStart = 44;
  let sumSquares = 0;
  let count = 0;
  for (let i = dataStart; i + 1 < buffer.length; i += 2) {
    const sample = buffer.readInt16LE(i);
    sumSquares += sample * sample;
    count += 1;
  }
  execFileSync("rm", ["-f", tmpWav]);
  return count > 0 ? Math.sqrt(sumSquares / count) : 0;
};

async function main() {
  const { mp4Path: mp4PathArg, dataFileName, manifestPath: manifestPathArg } = parseArgs(process.argv.slice(2));
  if (!mp4PathArg) {
    console.error("Usage: npx tsx scripts/validate-render.ts <path-to.mp4> [--data <dataFileName>] [--manifest <path>]");
    process.exitCode = 1;
    return;
  }
  const mp4Path = resolve(repoRoot, mp4PathArg);
  if (!existsSync(mp4Path)) {
    console.error(`Not found: ${mp4Path}`);
    process.exitCode = 1;
    return;
  }

  const checks: Check[] = [];
  const ffprobe = findFfprobe();
  const ffmpeg = findFfmpeg();

  const probe = ffprobeJson(ffprobe, mp4Path);
  const videoStream = probe.streams?.find((s: any) => s.codec_type === "video");
  const audioStream = probe.streams?.find((s: any) => s.codec_type === "audio");
  const durationSeconds = parseFloat(probe.format?.duration ?? "0");

  checks.push({
    name: "Audio track exists",
    pass: Boolean(audioStream),
    detail: audioStream ? `codec=${audioStream.codec_name}` : "no audio stream found",
  });

  checks.push({
    name: "Video resolution is 1920x1080",
    pass: videoStream?.width === 1920 && videoStream?.height === 1080,
    detail: videoStream ? `${videoStream.width}x${videoStream.height}` : "no video stream found",
  });

  checks.push({
    name: "Video codec is h264",
    pass: videoStream?.codec_name === "h264",
    detail: videoStream?.codec_name ?? "unknown",
  });

  // Non-silence: sample RMS at several points spread across the video.
  const samplePoints = [0.1, 0.3, 0.5, 0.7, 0.9].map((frac) => Math.max(1, Math.floor(durationSeconds * frac)));
  const rmsResults = samplePoints.map((t) => ({ t, rms: rmsAt(ffmpeg, mp4Path, t, 2) }));
  const silentPoints = rmsResults.filter((r) => r.rms < 50); // near-digital-silence floor
  checks.push({
    name: "Audio is not silent (sampled at 5 points)",
    pass: silentPoints.length === 0,
    detail: rmsResults.map((r) => `t=${r.t}s RMS=${r.rms.toFixed(0)}`).join(", "),
  });

  if (dataFileName) {
    const dataFilePath = join(repoRoot, "src/data", `${dataFileName}.ts`);
    if (existsSync(dataFilePath)) {
      const mod = (await import(pathToFileURL(dataFilePath).href)) as { [key: string]: unknown };
      const totalDurationKey = Object.keys(mod).find((k) => k.startsWith("TOTAL_DURATION_SECONDS"));
      const expectedDuration = totalDurationKey ? (mod[totalDurationKey] as number) : undefined;
      if (expectedDuration) {
        const diff = Math.abs(durationSeconds - expectedDuration);
        checks.push({
          name: "Video duration matches script's TOTAL_DURATION_SECONDS",
          pass: diff < 1,
          detail: `expected ${expectedDuration}s, got ${durationSeconds.toFixed(2)}s (diff ${diff.toFixed(2)}s)`,
        });
      }

      const beatsExportName = Object.keys(mod).find((key) => {
        const value = mod[key];
        return Array.isArray(value) && value.length > 0 && typeof (value[0] as { type?: unknown })?.type === "string";
      });
      const rawBeats = beatsExportName
        ? (mod[beatsExportName] as { duration?: number; audioFile?: string; segments?: { audioFile: string; t: number }[] }[])
        : [];

      // Flatten investigation-style segments the same way generate-audio.ts does.
      const flatBeats: { audioFile: string; allocatedSeconds: number }[] = [];
      for (const beat of rawBeats) {
        if (beat.segments) {
          for (let i = 0; i < beat.segments.length; i++) {
            const seg = beat.segments[i];
            const nextT = beat.segments[i + 1]?.t ?? beat.duration ?? 0;
            flatBeats.push({ audioFile: seg.audioFile, allocatedSeconds: nextT - seg.t });
          }
        } else if (beat.audioFile) {
          flatBeats.push({ audioFile: beat.audioFile, allocatedSeconds: beat.duration ?? 0 });
        }
      }

      if (manifestPathArg) {
        const manifestPath = resolve(repoRoot, manifestPathArg);
        if (existsSync(manifestPath)) {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
            entries: { audioPath: string; durationSeconds: number }[];
          };
          const byPath = new Map(manifest.entries.map((e) => [e.audioPath, e.durationSeconds]));

          const missing = flatBeats.filter((b) => !byPath.has(b.audioFile));
          checks.push({
            name: "Every beat's audio file exists in the manifest",
            pass: missing.length === 0,
            detail: missing.length === 0 ? "all present" : `missing: ${missing.map((b) => b.audioFile).join(", ")}`,
          });

          const overflowing = flatBeats.filter((b) => {
            const actual = byPath.get(b.audioFile);
            return actual !== undefined && actual + 0.5 > b.allocatedSeconds; // +0.5s lead-in, matching the render's own convention
          });
          checks.push({
            name: "No beat's narration exceeds its allocated time window (no cutoff/overlap)",
            pass: overflowing.length === 0,
            detail:
              overflowing.length === 0
                ? "all within budget"
                : overflowing
                    .map((b) => `${b.audioFile}: audio+leadin=${(byPath.get(b.audioFile)! + 0.5).toFixed(2)}s > window=${b.allocatedSeconds.toFixed(2)}s`)
                    .join("; "),
          });
        } else {
          console.warn(`Manifest not found at ${manifestPath}, skipping per-beat timing checks.`);
        }
      }
    }
  }

  console.log(`\nValidation report for ${mp4Path}\n${"=".repeat(60)}`);
  let allPass = true;
  for (const check of checks) {
    const mark = check.pass ? "PASS" : "FAIL";
    if (!check.pass) allPass = false;
    console.log(`[${mark}] ${check.name}\n       ${check.detail}`);
  }
  console.log(`${"=".repeat(60)}\n${allPass ? "All checks passed." : "Some checks FAILED — see above."}`);

  process.exitCode = allPass ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
