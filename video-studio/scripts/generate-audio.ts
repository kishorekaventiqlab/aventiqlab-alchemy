/**
 * Generates one narration audio file per captioned beat in a video data
 * file, using Chatterbox V3 (local, offline, no cloud calls — see
 * video-studio/tools/chatterbox/README.md for setup and
 * docs/experiments/chatterbox-v3-tts.md for why this project standardized
 * on it over the two prior platform-specific approaches and Piper).
 *
 * Usage: npx tsx scripts/generate-audio.ts <data-file-name>
 *   <data-file-name> is the basename (no .ts) of a file under src/data/
 *   exporting a `Beat[]` array where non-title beats have a `caption`
 *   string - the caption becomes that beat's narration audio.
 *
 * Output: public/audio/<data-file-name>/beat<N>.wav + a manifest.json in
 * the same folder recording each entry's actual synthesized duration and a
 * content hash so unchanged narration is skipped on rerun. Each data file
 * gets its own subfolder so two scripts' beat numbering (e.g. both having a
 * "beat2.wav") can never collide with each other.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadAudioConfig, voiceName } from "../src/audio/config";
import { ChatterboxProvider } from "../src/audio/providers/ChatterboxProvider";
import { audioContentHash } from "../src/audio/cache";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

type ManifestEntry = {
  beatIndex: number;
  audioPath: string;
  durationSeconds: number;
  contentHash: string;
  providerId: string;
  voice: string;
};

type Manifest = {
  dataFile: string;
  generatedAt: string;
  entries: ManifestEntry[];
};

const loadManifest = (manifestPath: string): Manifest | null => {
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
  } catch {
    return null;
  }
};

async function main() {
  const dataFileName = process.argv[2];
  if (!dataFileName) {
    console.error("Usage: npx tsx scripts/generate-audio.ts <data-file-name>");
    console.error("  e.g. npx tsx scripts/generate-audio.ts inferenceUnderLoadScript");
    process.exitCode = 1;
    return;
  }

  const dataFilePath = join(repoRoot, "src/data", `${dataFileName}.ts`);
  if (!existsSync(dataFilePath)) {
    console.error(`Not found: ${dataFilePath}`);
    process.exitCode = 1;
    return;
  }

  const config = loadAudioConfig(repoRoot);
  if (!existsSync(config.chatterbox.pythonBin)) {
    console.error(`Chatterbox Python interpreter not found at ${config.chatterbox.pythonBin}`);
    console.error("See video-studio/tools/chatterbox/README.md to set up the environment.");
    process.exitCode = 1;
    return;
  }

  const provider = new ChatterboxProvider({
    pythonBin: config.chatterbox.pythonBin,
    scriptPath: config.chatterbox.scriptPath,
    voiceRefPath: config.chatterbox.voiceRefPath,
    device: config.chatterbox.device,
  });
  const voice = voiceName(config);

  const mod = (await import(pathToFileURL(dataFilePath).href)) as {
    [key: string]: unknown;
  };
  // Data files also export helper arrays (ARCH_NODES, ARCH_EDGES, etc.)
  // reused by scene components, so picking "the first array export" is not
  // unambiguous - a Beat[] is distinguished by its elements each having a
  // `type` string, which the helper arrays don't.
  const beatsExportName = Object.keys(mod).find((key) => {
    const value = mod[key];
    return Array.isArray(value) && value.length > 0 && typeof (value[0] as { type?: unknown })?.type === "string";
  });
  const rawBeats = beatsExportName
    ? (mod[beatsExportName] as { caption?: string; segments?: { caption: string; audioFile: string }[] }[])
    : undefined;
  if (!rawBeats) {
    console.error(`No exported Beat[] array found in ${dataFilePath}`);
    process.exitCode = 1;
    return;
  }

  // A beat can carry its narration directly (`caption`) or, for a beat like
  // `investigation` that renders one continuous scene under several spoken
  // segments, as a `segments[].caption` array - each segment already names
  // its own audioFile (e.g. "beat14.wav"), so flatten those in first and let
  // the loop below key everything else off array position as before.
  const beats: { caption?: string; audioFile?: string }[] = [];
  for (const beat of rawBeats) {
    if (beat.segments) {
      for (const seg of beat.segments) beats.push({ caption: seg.caption, audioFile: seg.audioFile });
    } else {
      beats.push(beat);
    }
  }

  const audioDir = join(repoRoot, "public/audio", dataFileName);
  const manifestPath = join(audioDir, `${dataFileName}.manifest.json`);
  mkdirSync(audioDir, { recursive: true });

  console.log(`Voice: ${voice}`);
  console.log(`Output: ${audioDir}`);

  const previousManifest = loadManifest(manifestPath);
  const previousByAudioPath = new Map(
    (previousManifest?.entries ?? []).map((e) => [e.audioPath, e]),
  );

  const entries: ManifestEntry[] = [];
  let generated = 0;
  let reused = 0;
  let skipped = 0;
  const generationStart = Date.now();

  for (let i = 0; i < beats.length; i++) {
    const text = beats[i]?.caption;
    if (!text) {
      skipped += 1;
      continue; // e.g. the title beat, which has no narration audio
    }

    // This repo's convention (established by inferenceUnderLoadScript.ts):
    // array index 0 is always the title card ("beat 1", no audio), so a
    // captioned beat at array index i is narrated "beat" number (i + 1) -
    // unless the beat (or, after flattening, its segment) already names its
    // own audioFile explicitly, which takes precedence.
    const fileName = beats[i]?.audioFile ?? `beat${i + 1}.wav`;
    const absoluteOutputPath = join(audioDir, fileName);
    const hash = audioContentHash(text, provider.id, voice);

    const previous = previousByAudioPath.get(fileName);
    const canReuse = previous && previous.contentHash === hash && existsSync(absoluteOutputPath);

    if (canReuse && previous) {
      entries.push(previous);
      reused += 1;
      console.log(`  [cached]     ${fileName} (${previous.durationSeconds.toFixed(2)}s)`);
      continue;
    }

    const beatStart = Date.now();
    const result = await provider.synthesize(text, absoluteOutputPath, {});
    const beatSeconds = (Date.now() - beatStart) / 1000;
    const entry: ManifestEntry = {
      beatIndex: i,
      audioPath: fileName,
      durationSeconds: result.durationSeconds,
      contentHash: hash,
      providerId: provider.id,
      voice,
    };
    entries.push(entry);
    generated += 1;
    console.log(
      `  [generated]  ${fileName} (${result.durationSeconds.toFixed(2)}s audio, ${beatSeconds.toFixed(2)}s wall time)`,
    );
  }

  const totalWallSeconds = (Date.now() - generationStart) / 1000;

  const manifest: Manifest = {
    dataFile: dataFileName,
    generatedAt: new Date().toISOString(),
    entries,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const totalAudioSeconds = entries.reduce((sum, e) => sum + e.durationSeconds, 0);
  console.log(
    `\nDone: ${generated} generated, ${reused} reused from cache, ${skipped} beats had no caption.`,
  );
  console.log(`Total audio duration: ${totalAudioSeconds.toFixed(1)}s. Wall time this run: ${totalWallSeconds.toFixed(1)}s.`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(
    "Next: update each beat's `duration` (seconds) in the .ts data file to match durationSeconds + a ~3s buffer.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
