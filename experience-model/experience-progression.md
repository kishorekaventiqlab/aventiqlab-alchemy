# Experience Progression

Every experience is tagged with a `progression_archetype` (schema: [`/schemas/experience.schema.json`](../schemas/experience.schema.json), vocab: [`/schemas/common/vocab.schema.json`](../schemas/common/vocab.schema.json)). The archetype names the *dominant* verb the experience develops — most experiences touch more than one verb, but one should always be primary.

| Archetype | Dominant verb | Why it dominates at this stage |
|---|---|---|
| `foundation-build` | BUILD | Before an engineer can operate or troubleshoot a system, they need to have built one — construction is what makes the system's shape legible. |
| `intermediate-operate` | OPERATE | Once a working system exists, the next capability is running it day-to-day: monitoring, routine response, keeping it healthy under normal conditions. |
| `advanced-troubleshoot` | TROUBLESHOOT | Real seniority shows up under uncertainty — diagnosing root cause in a live system with incomplete information, not just following a runbook. |
| `expert-optimize` | OPERATE + DESIGN (optimization) | Beyond keeping a system alive, an expert improves it under real constraints — cost, latency, capacity — while it stays in production. |
| `architect-design` | DESIGN | The highest-leverage capability: making and defending cross-constraint tradeoffs that shape a system (or multiple systems) before they're built. |

This progression is not a strict per-learner sequence (a 5yr engineer might do a `foundation-build` experience in a domain new to them, e.g. LLMOps), but across the curriculum as a whole it should recur: most domains should eventually have an experience at each stage.

## Catalog experiences mapped to archetype

| Experience | Archetype | Target band(s) |
|---|---|---|
| `exp-deploy-inference-service` | foundation-build | 3yr |
| `exp-build-autoscaling-inference-platform` | foundation-build | 5yr |
| `exp-roll-out-model-safely` | intermediate-operate | 5yr |
| `exp-operate-llm-platform-under-traffic-growth` | intermediate-operate | 5yr, 7yr |
| `exp-inference-under-load` | advanced-troubleshoot | 5yr, 7yr |
| `exp-diagnose-gpu-capacity-exhaustion` | advanced-troubleshoot | 7yr |
| `exp-diagnose-model-serving-latency` | advanced-troubleshoot | 5yr, 7yr |
| `exp-troubleshoot-failing-ml-pipeline` | advanced-troubleshoot | 5yr, 7yr |
| `exp-diagnose-broken-rag-pipeline` | advanced-troubleshoot | 7yr |
| `exp-handle-production-ai-incident` | advanced-troubleshoot | 7yr |
| `exp-optimize-gpu-utilization` | expert-optimize | 7yr, 10yr |
| `exp-reduce-ai-platform-cost` | expert-optimize | 7yr, 10yr |
| `exp-design-multi-tenant-ai-infrastructure` | architect-design | 10yr, staff-principal |
| `exp-design-highly-available-model-serving` | architect-design | 10yr, staff-principal |
| `exp-design-internal-ai-platform-for-teams` | architect-design | staff-principal |
