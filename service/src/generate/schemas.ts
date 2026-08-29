/**
 * DELIVERABLE JSON schemas per artifact type (the "Artifact JSON" / §7.3
 * `content` shape). Distinct from the repo's /schemas/*.json, which describe
 * the artifact *spec*. These describe the full generated deliverable, matching
 * the real experience-catalog/<exp>/content/ files.
 *
 * Used two ways:
 *   - handed to the model as the JSON-mode response schema (structure hint)
 *   - checked locally by selfcheck.ts before returning to astra (§4)
 *
 * Enums are pulled from the repo's controlled vocabulary
 * (schemas/common/vocab.schema.json) so a generated artifact can't invent a
 * dimension / level / format value.
 */

const PROFICIENCY_LEVEL = ["Beginner", "Intermediate", "Advanced", "Expert", "Architect"];
const EVALUATION_DIMENSION = [
  "KNOWLEDGE",
  "REASONING",
  "APPLICATION",
  "TROUBLESHOOTING",
  "TRADE_OFF_ANALYSIS",
  "COMMUNICATION",
  "ENGINEERING_JUDGMENT",
];
const CAPABILITY_VERB = ["KNOW", "UNDERSTAND", "BUILD", "OPERATE", "DESIGN", "TROUBLESHOOT", "EXPLAIN", "PROVE"];
const QUIZ_QUESTION_TYPE = ["multiple-choice", "scenario-judgment", "ordering", "short-answer"];
const MATERIAL_FORMAT = ["article", "diagram-walkthrough", "reference-doc"];

export const MATERIAL_SCHEMA = {
  $id: "material.v1.json",
  type: "object",
  additionalProperties: false,
  required: ["title", "format", "reading_time_minutes", "key_sections", "body_markdown"],
  properties: {
    title: { type: "string", minLength: 1 },
    format: { type: "string", enum: MATERIAL_FORMAT },
    reading_time_minutes: { type: "integer", minimum: 1 },
    key_sections: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    body_markdown: { type: "string", minLength: 1 },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "level", "body_markdown"],
        properties: {
          heading: { type: "string" },
          level: { type: "integer", minimum: 1, maximum: 4 },
          body_markdown: { type: "string" },
        },
      },
    },
  },
} as const;

export const QUIZ_SCHEMA = {
  $id: "quiz.v1.json",
  type: "object",
  additionalProperties: false,
  required: ["passing_threshold_percent", "question_types", "questions"],
  properties: {
    artifact_ref: { type: "string" },
    passing_threshold_percent: { type: "integer", minimum: 1, maximum: 100 },
    question_types: { type: "array", minItems: 1, items: { type: "string", enum: QUIZ_QUESTION_TYPE } },
    questions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "prompt", "explanation"],
        properties: {
          id: { type: "string", minLength: 1 },
          type: { type: "string", enum: QUIZ_QUESTION_TYPE },
          material_section: { type: "string" },
          prompt: { type: "string", minLength: 1 },
          // multiple-choice / scenario-judgment: letter-keyed options + correct letter
          options: {
            type: "object",
            minProperties: 2,
            propertyNames: { pattern: "^[a-z]$" },
            additionalProperties: { type: "string", minLength: 1 },
          },
          correct: { type: "string", pattern: "^[a-z]$" },
          // ordering: an ordered array; short-answer: a model answer string
          ordering: { type: "array", items: { type: "string" }, minItems: 2 },
          answer: { type: "string" },
          explanation: { type: "string", minLength: 1 },
        },
      },
    },
  },
} as const;

export const SOURCE_CODE_LAB_SCHEMA = {
  $id: "source-code-lab.v1.json",
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "repo_or_starter_ref",
    "environment_requirements",
    "hints_available",
    "tasks",
    "starter_file_tree",
  ],
  properties: {
    title: { type: "string", minLength: 1 },
    repo_or_starter_ref: { type: "string", minLength: 1 },
    environment_requirements: { type: "array", minItems: 1, items: { type: "string" } },
    hints_available: { type: "boolean" },
    tasks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "instructions_markdown", "completion_bar"],
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          instructions_markdown: { type: "string", minLength: 1 },
          completion_bar: { type: "string", minLength: 1 },
          hints: { type: "array", items: { type: "string" } },
          solution_files: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["path", "contents"],
              properties: { path: { type: "string" }, contents: { type: "string" } },
            },
          },
        },
      },
    },
    starter_file_tree: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "contents"],
        properties: {
          path: { type: "string", minLength: 1 },
          contents: { type: "string" },
          is_todo_stub: { type: "boolean" },
        },
      },
    },
  },
} as const;

export const SKILL_EVALUATOR_SCHEMA = {
  $id: "skill-evaluator.v1.json",
  type: "object",
  additionalProperties: false,
  // The 15 required fields of schemas/skill-evaluator.schema.json (minus id/
  // experience_ref, which the pipeline supplies), plus id/experience_ref kept
  // optional so a generated object that includes them still validates.
  required: [
    "skills_evaluated",
    "scenario",
    "opening_question",
    "expected_reasoning_areas",
    "follow_up_question_paths",
    "misconception_indicators",
    "strong_answer_indicators",
    "weak_answer_indicators",
    "evidence_criteria",
    "scoring_dimensions",
    "proficiency_levels",
    "pass_conditions",
    "escalation_rules",
  ],
  properties: {
    id: { type: "string" },
    experience_ref: { type: "string" },
    skills_evaluated: { type: "array", minItems: 1, items: { type: "string", pattern: "^cap-[a-z0-9-]+$" } },
    scenario: { type: "string", minLength: 1 },
    opening_question: { type: "string", minLength: 1 },
    expected_reasoning_areas: { type: "array", minItems: 1, items: { type: "string" } },
    follow_up_question_paths: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["trigger", "follow_up_question", "targets_reasoning_area"],
        properties: {
          trigger: { type: "string" },
          follow_up_question: { type: "string" },
          targets_reasoning_area: { type: "string" },
        },
      },
    },
    misconception_indicators: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["misconception", "likely_root_cause", "corrective_follow_up"],
        properties: {
          misconception: { type: "string" },
          likely_root_cause: { type: "string" },
          corrective_follow_up: { type: "string" },
        },
      },
    },
    strong_answer_indicators: { type: "array", minItems: 1, items: { type: "string" } },
    weak_answer_indicators: { type: "array", minItems: 1, items: { type: "string" } },
    evidence_criteria: { type: "array", minItems: 1, items: { type: "string" } },
    scoring_dimensions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "description", "weight_percent"],
        properties: {
          dimension: { type: "string", enum: EVALUATION_DIMENSION },
          description: { type: "string" },
          weight_percent: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
    proficiency_levels: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["level", "description", "criteria"],
        properties: {
          level: { type: "string", enum: PROFICIENCY_LEVEL },
          description: { type: "string" },
          criteria: { type: "array", items: { type: "string" } },
        },
      },
    },
    pass_conditions: {
      type: "object",
      additionalProperties: false,
      required: ["minimum_level", "required_dimensions"],
      properties: {
        minimum_level: { type: "string", enum: PROFICIENCY_LEVEL },
        required_dimensions: { type: "array", items: { type: "string", enum: EVALUATION_DIMENSION } },
      },
    },
    escalation_rules: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["condition", "action"],
        properties: { condition: { type: "string" }, action: { type: "string" } },
      },
    },
  },
} as const;

export { VIDEO_SCHEMA } from "./video-schema.js";
import { VIDEO_SCHEMA } from "./video-schema.js";

export const DELIVERABLE_SCHEMA: Record<string, object> = {
  material: MATERIAL_SCHEMA,
  quiz: QUIZ_SCHEMA,
  source_code_lab: SOURCE_CODE_LAB_SCHEMA,
  skill_evaluator: SKILL_EVALUATOR_SCHEMA,
  video: VIDEO_SCHEMA,
};

export { CAPABILITY_VERB, EVALUATION_DIMENSION, PROFICIENCY_LEVEL };
