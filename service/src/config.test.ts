import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGenerationConfig, ConfigError } from "./config.js";

const ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "ALCHEMY_CONTENT_BUCKET",
  "OPENROUTER_MODEL_DEFAULT",
  "OPENROUTER_MODEL_MATERIAL",
  "OPENROUTER_MODEL_QUIZ",
  "OPENROUTER_MODEL_SOURCE_CODE_LAB",
  "OPENROUTER_MODEL_SKILL_EVALUATOR",
] as const;

function withEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => Promise<void>) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.ALCHEMY_CONTENT_BUCKET = "test-bucket";
  Object.assign(process.env, vars);
  return fn().finally(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

test("loadGenerationConfig defaults to Gemini with no env override", async () => {
  await withEnv({}, async () => {
    const cfg = await loadGenerationConfig("ap-south-1");
    assert.equal(cfg.defaultModel, "google/gemini-3.7-flash");
    for (const type of ["material", "quiz", "source_code_lab", "skill_evaluator"] as const) {
      assert.match(cfg.modelByType[type]!, /^google\/gemini-/, `${type} defaults to a Gemini model`);
    }
  });
});

test("loadGenerationConfig rejects OPENROUTER_MODEL_DEFAULT set to Claude Sonnet", async () => {
  await withEnv({ OPENROUTER_MODEL_DEFAULT: "anthropic/claude-sonnet-4" }, async () => {
    await assert.rejects(
      () => loadGenerationConfig("ap-south-1"),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /OPENROUTER_MODEL_DEFAULT/);
        assert.match(err.message, /not a Gemini model/);
        return true;
      },
    );
  });
});

test("loadGenerationConfig rejects a per-type override set to Claude Sonnet, even with a valid default", async () => {
  await withEnv(
    { OPENROUTER_MODEL_DEFAULT: "google/gemini-3.7-flash", OPENROUTER_MODEL_QUIZ: "anthropic/claude-sonnet-4" },
    async () => {
      await assert.rejects(
        () => loadGenerationConfig("ap-south-1"),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.match(err.message, /OPENROUTER_MODEL_QUIZ/);
          return true;
        },
      );
    },
  );
});

test("loadGenerationConfig accepts a per-type override set to a different Gemini model", async () => {
  await withEnv({ OPENROUTER_MODEL_MATERIAL: "google/gemini-3.6-flash" }, async () => {
    const cfg = await loadGenerationConfig("ap-south-1");
    assert.equal(cfg.modelByType.material, "google/gemini-3.6-flash");
    assert.equal(cfg.defaultModel, "google/gemini-3.7-flash");
  });
});

test("loadGenerationConfig rejects a model id from an unrelated provider, not just anthropic/", async () => {
  await withEnv({ OPENROUTER_MODEL_DEFAULT: "openai/gpt-4o" }, async () => {
    await assert.rejects(() => loadGenerationConfig("ap-south-1"), ConfigError);
  });
});
