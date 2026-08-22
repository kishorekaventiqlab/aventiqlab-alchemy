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
| MLOps | Beginner | Intermediate | Advanced | Advanced | Advanced |
| LLMOps | Beginner | Beginner | Intermediate | Advanced | Advanced |
| AI Reliability/SRE | Beginner | Intermediate | Expert | Expert | Expert |
| Platform Architecture | Beginner | Beginner | Advanced | Expert | Architect |

Not every capability follows the same curve, deliberately:

- **Kubernetes / GPU Engineering / Model Serving / AI Infrastructure** climb smoothly all the way to Architect — these are the domains where seniority tracks directly with scope.
- **Foundations / Cloud Platform Engineering / Observability** climb fast early and then plateau — they're operational-excellence capabilities, not what distinguishes a Staff engineer from an Architect.
- **MLOps** plateaus at Advanced from 7yr onward — it gets *delegated*, not personally deepened, once an engineer reaches Staff.
- **LLMOps** climbs the slowest and never reaches Architect — the domain itself is still emergent.
- **AI Reliability/SRE** jumps to Expert at 7yr and then plateaus — operational incident-response maturity peaks before formal seniority does.
- **Platform Architecture** is the steepest late climb — it stays at Beginner through 5yr, since cross-capability tradeoff judgment is the last thing to mature.
