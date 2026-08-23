# Experience × Capability Matrix

Rendered view of [`experience-capability-matrix.yaml`](experience-capability-matrix.yaml) — the two files are hand-kept in sync (Phase 0 ships no generator). If you edit one, edit both.

Proficiency levels only (see the YAML for the full behavioral prose per cell and the `notes[]` explaining every non-uniform curve).

| Capability | 3yr | 5yr | 7yr | 10yr | Staff/Principal |
|---|---|---|---|---|---|
| Foundations | Beginner | Intermediate | Advanced | Expert | Expert |
| Cloud Platform Engineering | Beginner | Advanced | Expert | Expert | Expert |
| Kubernetes | Beginner | Intermediate | Advanced | Expert | Architect |
| GPU Engineering | Beginner | Intermediate | Advanced | Expert | Architect |
| Model Serving | Beginner | Intermediate | Advanced | Expert | Architect |
| Observability | Beginner | Intermediate | Advanced | Expert | Expert |
| AI Infrastructure | Beginner | Intermediate | Advanced | Expert | Architect |
| MLOps (Pipeline Orchestration) | Beginner | Intermediate | Advanced | Advanced | Advanced |
| MLOps (Fine-Tuning & Adapter Lifecycle) | Beginner | Beginner | Intermediate | Advanced | Advanced |
| LLMOps (Prompt & Eval Pipelines) | Beginner | Beginner | Intermediate | Advanced | Advanced |
| LLMOps (Retrieval Pipeline Construction) | Beginner | Intermediate | Advanced | Advanced | Advanced |
| LLMOps (Agent & Tool-Use Orchestration) | Beginner | Intermediate | Advanced | Advanced | Advanced |
| AI Reliability/SRE | Beginner | Intermediate | Expert | Expert | Expert |
| AI Security | Beginner | Beginner | Intermediate | Advanced | Advanced |
| Platform Architecture | Beginner | Beginner | Advanced | Expert | Architect |

Not every capability follows the same curve, deliberately:

- **Kubernetes / GPU Engineering / Model Serving / AI Infrastructure** climb smoothly all the way to Architect — these are the domains where seniority tracks directly with scope.
- **Foundations / Cloud Platform Engineering / Observability** climb fast early and then plateau — they're operational-excellence capabilities, not what distinguishes a Staff engineer from an Architect.
- **MLOps** (both pipeline orchestration and fine-tuning/adapter lifecycle) plateaus at Advanced from 7yr/10yr onward — it gets *delegated*, not personally deepened, once an engineer reaches Staff. Fine-tuning lags pipeline orchestration by one band since dataset curation and promotion-gate judgment take longer to mature than pipeline mechanics.
- **LLMOps** (all three capabilities: prompt & eval pipelines, retrieval pipeline construction, agent & tool-use orchestration) climbs the slowest and never reaches Architect — the domain itself is still emergent. Retrieval construction and agent orchestration reach Intermediate a band earlier than prompt & eval pipelines since they're build-oriented rather than judgment-oriented capabilities.
- **AI Security** follows the same emergent-domain curve as LLMOps and never reaches Architect — it was only just authored and the field hasn't produced a system-design differentiator yet.
- **AI Reliability/SRE** jumps to Expert at 7yr and then plateaus — operational incident-response maturity peaks before formal seniority does.
- **Platform Architecture** is the steepest late climb — it stays at Beginner through 5yr, since cross-capability tradeoff judgment is the last thing to mature.
