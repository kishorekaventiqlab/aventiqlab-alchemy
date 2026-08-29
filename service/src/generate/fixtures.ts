/**
 * Test fixtures: a Learning IR context, and one valid `content` object per
 * artifact type shaped like the real experience-catalog/exp-inference-under-load
 * content/ files. Used to drive the mocked OpenRouter in tests.
 */
import type { LearningContext } from "./types.js";

export const LEARNING_CONTEXT: LearningContext = {
  schema_version: "learning-ir/v1",
  learning_context_id: "lctx_01TEST",
  title: "Operating an AI Inference Platform Under Load",
  topic: "How workload-level and node-level autoscaling interact on EKS GPU workloads",
  learner_level: "Intermediate",
  tone: "Practical & direct",
  progression_archetype: "advanced-troubleshoot",
  learner_profile_refs: ["lp-5yr-ai-platform-engineer"],
  target_capabilities: [
    { id: "cap-gpu-engineering-utilization-and-capacity-signals", resolved: true, name: "GPU utilization & capacity signals" },
    { id: "cap-kubernetes-workload-scaling-for-inference", resolved: true, name: "Kubernetes workload scaling for inference" },
  ],
  learning_outcomes: [
    {
      id: "out-inference-under-load-01",
      learner_summary: "Diagnose GPU compute saturation as the root cause, ruling out a plausible alternative.",
      action: { verb: "TROUBLESHOOT", statement: "Diagnose the root-cause bottleneck behind rising inference latency." },
      context: "Given a Kubernetes inference platform at 92% GPU utilization...",
      expected_result: "the learner attributes the degradation to GPU compute saturation.",
    },
  ],
  scenario:
    "You are the on-call AI Platform Engineer for an LLM summarization feature on EKS with a GPU node pool behind a KEDA-scaled Deployment. A campaign triples traffic in 20 minutes.",
  business_context: "The feature is a paid-tier differentiator; sustained p99 SLA breaches trigger contractual credits.",
  technical_environment: {
    platform: "Amazon EKS",
    infrastructure_summary: "GPU node pool (g5.2xlarge / A10G) runs Triton/vLLM behind a KEDA-scaled Deployment; Cluster Autoscaler to a GPU quota ceiling; Prometheus/Grafana/PagerDuty.",
    key_services: ["Amazon EKS", "KEDA", "Cluster Autoscaler", "Prometheus", "Grafana"],
  },
  starting_state:
    "GPU utilization 60%->92% over 15 min. Queue depth climbing. p50 within SLA; p99 up 3x. KEDA at max replicas. Node ASG at the GPU quota ceiling.",
  learner_mission:
    "Diagnose the bottleneck, mitigate within the current GPU quota ceiling, and propose a longer-term fix with an explicit tradeoff.",
  expected_investigation: [
    "Confirm compute-bound vs memory-bound from GPU dashboards.",
    "Check KEDA replica count against its maximum.",
    "Check the node pool ASG size against the account GPU quota.",
  ],
  expected_decisions: [
    {
      decision_point: "What is the actual root-cause bottleneck?",
      options_considered: [
        "Correct: GPU compute saturation.",
        "Plausible but wrong: a Kubernetes scheduling problem.",
        "Plausible but wrong: a network/ingress bottleneck.",
      ],
      sound_reasoning: "92%+ GPU utilization + widening p50/p99 + saturated replicas is a compute-saturation signature.",
    },
  ],
  trade_offs: [
    {
      tension: "Request shedding vs degraded quality",
      choice_a: "Shed excess requests to protect the paid-tier SLA.",
      choice_b: "Reduce batch size or precision to preserve throughput for all.",
    },
  ],
  constraints: ["Fixed GPU service quota.", "Contractual p99 latency SLA for paid-tier customers."],
  failure_modes: [
    "Tuning Kubernetes-level scaling that cannot add GPU beyond the quota ceiling.",
    "Waiting on an emergency quota increase instead of acting now.",
  ],
  success_conditions: [
    "Root cause correctly attributed to GPU compute saturation with >=2 signals.",
    "A mitigation executable within the current GPU quota ceiling.",
  ],
  mental_model: [
    "Traffic increases.",
    "KEDA increases pod replicas.",
    "New pods need scheduling onto GPU nodes.",
    "No capacity -> pods stay Pending.",
    "Karpenter provisions a GPU node.",
  ],
  core_concept: "KEDA decides how many replicas; the scheduler decides where they run; Karpenter decides whether capacity exists.",
  learner_problem: "Why pod autoscaling is not enough for GPU workloads.",
};

export const VALID_CONTENT = {
  material: {
    title: "GPU Inference Capacity & Autoscaling Signals",
    format: "article",
    reading_time_minutes: 20,
    key_sections: ["GPU utilization signals", "Kubernetes autoscaling primitives", "GPU service quotas", "Summary"],
    body_markdown: [
      "## GPU utilization signals",
      "GPU utilization is the share of time a kernel was executing. High utilization with flat memory is a compute-saturation signature.",
      "",
      "## Kubernetes autoscaling primitives",
      "HPA and KEDA scale replica count. Cluster Autoscaler and Karpenter scale nodes. Confusing their scope is a costly mistake under incident pressure.",
      "",
      "## GPU service quotas",
      "A GPU quota ceiling bounds how many nodes you can add. Quota increases are not instant and cannot resolve a live incident.",
      "",
      "## Summary",
      "Pair at least two signals before concluding compute-bound. Know which autoscaler acts at which layer.",
    ].join("\n"),
  },
  quiz: {
    passing_threshold_percent: 80,
    question_types: ["multiple-choice", "scenario-judgment"],
    questions: [
      {
        id: "q1",
        type: "multiple-choice",
        material_section: "GPU utilization signals",
        prompt: "GPU compute utilization is at 95% while GPU memory utilization stays flat. What does this most likely indicate?",
        options: { a: "A memory leak", b: "A compute-bound workload", c: "A network bottleneck", d: "An autoscaler misconfiguration" },
        correct: "b",
        explanation: "Rising compute utilization with flat memory is the classic compute-saturation signature.",
      },
      {
        id: "q2",
        type: "scenario-judgment",
        material_section: "Kubernetes autoscaling primitives",
        prompt: "KEDA reports ACTIVE: true but replica count stays capped during a spike. Most likely cause?",
        options: { a: "KEDA is broken", b: "maxReplicaCount is reached", c: "The metric adapter is down", d: "The Deployment is invalid" },
        correct: "b",
        explanation: "An active scaler at its configured maximum looks broken but is a different problem.",
      },
    ],
  },
  source_code_lab: {
    title: "Build the Mitigation and Overflow-Capacity Configuration",
    repo_or_starter_ref: "lab-starters/exp-inference-under-load",
    environment_requirements: ["kind or a sandbox EKS cluster with KEDA", "kubectl", "Terraform CLI >= 1.5"],
    hints_available: true,
    tasks: [
      {
        id: "task-1",
        title: "Complete the KEDA ScaledObject",
        instructions_markdown: "Open `keda-scaledobject.yaml` and fill the three `# TODO` gaps: the Prometheus query, min/max replicas, and the trigger threshold.",
        completion_bar: "kubectl get scaledobject doc-search-summarizer -n inference shows READY: True",
        hints: ["Level 1: the query selects the queue-depth metric.", "Level 2: min 2, max 12.", "Level 3: threshold 20."],
        solution_files: [{ path: "keda-scaledobject.solution.yaml", contents: "apiVersion: keda.sh/v1alpha1\nkind: ScaledObject\n# ...completed" }],
      },
    ],
    starter_file_tree: [
      { path: "keda-scaledobject.yaml", contents: "apiVersion: keda.sh/v1alpha1\nkind: ScaledObject\n# TODO: query\n# TODO: min/max\n# TODO: threshold", is_todo_stub: true },
      { path: "README.md", contents: "# Lab\nRead content/material.md first." },
    ],
  },
  skill_evaluator: {
    skills_evaluated: ["cap-gpu-engineering-utilization-and-capacity-signals", "cap-ai-reliability-sre-incident-response-for-inference"],
    scenario: "A variant: same platform, 5x traffic instead of 3x, and a uniform SLA across all tiers so tier-based shedding is not a clean lever.",
    opening_question: "GPU utilization is at 95%, queue depth climbing, uniform SLA. Walk me through how you'd figure out what's wrong before touching anything.",
    expected_reasoning_areas: ["Root-cause diagnosis using corroborating signals", "Recognizing the quota ceiling changes the mitigation search space"],
    follow_up_question_paths: [
      { trigger: "Learner jumps to a mitigation without diagnosis.", follow_up_question: "What specifically told you this is GPU-bound?", targets_reasoning_area: "Root-cause diagnosis using corroborating signals" },
    ],
    misconception_indicators: [
      { misconception: "Autoscaling failing to relieve pressure means it is misconfigured.", likely_root_cause: "Doesn't distinguish misconfigured from at-a-hard-ceiling.", corrective_follow_up: "Check the replica count against KEDA's maxReplicaCount." },
    ],
    strong_answer_indicators: ["Names two corroborating signals before committing to a root cause."],
    weak_answer_indicators: ["Jumps to a fix before diagnosing."],
    evidence_criteria: ["Cites specific dashboard signals, not just 'I'd check the dashboards.'"],
    scoring_dimensions: [
      { dimension: "REASONING", description: "Diagnostic reasoning chain from symptom to root cause.", weight_percent: 40 },
      { dimension: "TROUBLESHOOTING", description: "Correct application of GPU/Kubernetes troubleshooting.", weight_percent: 35 },
      { dimension: "TRADE_OFF_ANALYSIS", description: "Quality of the tradeoff named for the mitigation.", weight_percent: 25 },
    ],
    proficiency_levels: [
      { level: "Beginner", description: "Cannot diagnose without heavy prompting.", criteria: ["Needs >2 prompts to a plausible root cause."] },
      { level: "Intermediate", description: "Reaches the root cause with some prompting.", criteria: ["Root cause within 1-2 follow-ups."] },
      { level: "Advanced", description: "Reaches root cause independently with corroborating signals.", criteria: ["States root cause with >=2 signals unprompted."] },
      { level: "Expert", description: "Transfers cleanly to the changed constraint.", criteria: ["Recognizes tier-shedding doesn't apply under a uniform SLA."] },
      { level: "Architect", description: "Generalizes into a durable architectural recommendation.", criteria: ["Proposes a longer-term fix with a quantified cost."] },
    ],
    pass_conditions: { minimum_level: "Advanced", required_dimensions: ["REASONING", "TROUBLESHOOTING"] },
    escalation_rules: [
      { condition: "Learner reaches Expert-level reasoning on the opening question with no follow-up.", action: "Skip to the longer-term-proposal follow-up to probe Architect-level generalization." },
    ],
  },
} as const;
