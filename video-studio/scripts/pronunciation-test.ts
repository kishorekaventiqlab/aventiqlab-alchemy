/**
 * Standalone technical-pronunciation smoke test — NOT part of the
 * production narration pipeline and does not touch any experience's
 * transcript. Synthesizes one short clip per term/phrase drawn from the
 * exp-inference-under-load vocabulary so a human can listen and judge
 * pronunciation (e.g. before adding a new technical term to a script).
 *
 * Usage:
 *   npx tsx scripts/pronunciation-test.ts
 *
 * Output: public/audio/pronunciation-test/<NN>-<slug>.wav
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAudioConfig, voiceName } from "../src/audio/config";
import { ChatterboxProvider } from "../src/audio/providers/ChatterboxProvider";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Terms/phrases as they actually appear in exp-inference-under-load's real
// narration (video-script.md) - isolated here only for a quick pronunciation
// check, not rewritten or simplified.
const TERMS: string[] = [
  "Kubernetes",
  "Amazon EKS",
  "KEDA",
  "Karpenter",
  "Kubernetes Scheduler",
  "GPU",
  "vLLM",
  "inference",
  "pods",
  "Pending state",
  "autoscaling",
  "node capacity",
  // A few in-context sentence-level checks, taken verbatim from the real script:
  "KEDA is doing exactly what it should: scaling the application layer to keep up.",
  "This is where Karpenter takes over. It sees pods that can't be scheduled because the cluster is out of room.",
  "Both GPU nodes are full. Kubernetes cannot place them, so they sit there, Pending.",
];

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

async function main() {
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
  const outDir = join(repoRoot, "public/audio/pronunciation-test");
  mkdirSync(outDir, { recursive: true });

  console.log(`Pronunciation test (voice: ${voice})`);
  console.log(`Output: ${outDir}\n`);

  const results: { term: string; file: string; durationSeconds: number; wallSeconds: number }[] = [];

  for (let i = 0; i < TERMS.length; i++) {
    const term = TERMS[i];
    const fileName = `${String(i + 1).padStart(2, "0")}-${slugify(term)}.wav`;
    const outputPath = join(outDir, fileName);
    const start = Date.now();
    const result = await provider.synthesize(term, outputPath, {});
    const wallSeconds = (Date.now() - start) / 1000;
    results.push({ term, file: fileName, durationSeconds: result.durationSeconds, wallSeconds });
    console.log(`  [${fileName}] "${term}" — ${result.durationSeconds.toFixed(2)}s audio, ${wallSeconds.toFixed(2)}s wall time`);
  }

  writeFileSync(
    join(outDir, "results.json"),
    JSON.stringify({ voice, generatedAt: new Date().toISOString(), results }, null, 2) + "\n",
  );

  console.log(`\nDone. Listen to the files in ${outDir}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
