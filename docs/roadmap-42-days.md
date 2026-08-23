# 42-Day Roadmap — Cloud/DevOps Architect → AI Platform Engineer

> The complete day-by-day curriculum. Six weeks, six sprints, six gates.
> Maps to `documents/aventiqlab-os-blueprint-v1.md` §4 (Weekly Milestones).

| | |
|---|---|
| **Programme** | AI Platform Engineering Mastery — AventiqLab |
| **Window** | 42 days · Sprint 1 begins Sat 25 Jul 2026 |
| **Start point** | 14 yrs AWS / DevOps / Platform Architecture |
| **End point** | Principal AI Platform Engineer — interview-ready |
| **Targets** | Amazon, Microsoft, NVIDIA, Databricks, Snowflake, ServiceNow, Salesforce, Uber |
| **Version** | 1.0 |

---

## The Arc

| Week | Days | Sprint | Theme | Gate |
|---|---|---|---|---|
| **1** | 01–07 | 1 | **LLM Engineering & Serving** | Serve an OSS model through your own gateway; p50/p95 + cost/1K tokens measured |
| **2** | 08–14 | 2 | **Production RAG** | RAG answers with citations; recall@k vs documented baseline; ADRs for vector store + chunking |
| **3** | 15–21 | 3 | **Agents & LLMOps** | Agent completes a multi-step task with approval gates; every request traced; evals in CI |
| **4** | 22–28 | 4 | **MLOps & K8s for AI at Scale** | Platform review passes production-readiness ≥ 85/100; scale/failure narrative documented |
| **5** | 29–35 | 5 | **AI System Design + Interview Sprint** | 2 full mock loops scored ≥ 4/5; all readiness dimensions ≥ 3.5 |
| **6** | 36–42 | Final | **Consolidation & Sign-off** | Resume frozen; readiness ≥ 4.0 weighted; content inventory complete |

**The through-line:** each sprint extends the *same* flagship platform rather than starting a new project. By Day 42 there is one coherent system whose every layer you built, documented, defended, and can whiteboard cold.

---

## Progress

```
Week 1  ███████  7/7    Days 01-07 complete · SPRINT 1 GATE PASSED
Week 2  ████░░░  4/7    Days 08-11 complete
Week 3  ░░░░░░░  0/7
Week 4  ░░░░░░░  0/7
Week 5  ░░░░░░░  0/7
Week 6  ░░░░░░░  0/7
                 ───
                11/42
```

---

# WEEK 1 — LLM Engineering & Serving

> **Gate:** Serve an OSS model through your own gateway with p50/p95 latency and cost per 1K tokens measured and documented. — **PASSED 28 Jul 2026**, see [`GATE-sprint-1.md`](week-01/day-07/LLM%20Gateway,%20Cost%20&%20Benchmarking/GATE-sprint-1.md)

### Day 01 — Deep Learning & Neural Networks ✅
**Covers:** AI/ML/DL/GenAI/LLM hierarchy · the artificial neuron (input, weight, bias, weighted sum, activation) · forward propagation · backpropagation and the training loop · loss, optimisers, learning rate · parameter counting and memory arithmetic · training vs inference infrastructure
**Deliverable:** `day-01/Deep Learning & Neural Network/` — 4,323 lines, 18 diagrams

### Day 02 — Generative AI Deep Dive ✅
**Covers:** discriminative vs generative · autoregressive generation, prefill vs decode · tokenisation and its cost implications · embeddings · decoding and sampling · the LLM lifecycle (pretrain → SFT → RLHF/DPO) · **the adaptation decision: prompt vs RAG vs fine-tune** · prompt engineering · RAG · LoRA/QLoRA · context and caching · hallucination · evaluation · agents · platform architecture · cost engineering
**Deliverable:** `day-02/Generative AI Deep Dive/` — 3,216 lines, 22 diagrams

### Day 03 — Transformers & Self-Attention ✅
**Covers:** why attention replaced recurrence · Q/K/V · scaled dot-product attention worked by hand · causal masking · multi-head attention · the Transformer block · residuals and normalisation · positional encoding and RoPE · encoder/decoder families · **MHA vs MQA vs GQA vs MLA** · **the KV cache formula** · FlashAttention · the quadratic problem · parameter budget · MoE · architecture → infrastructure mapping
**Deliverable:** `day-03/Transformers & Self-Attention/` — 2,726 lines, 20 diagrams

### Day 04 — LLM Inference Internals & Optimisation ✅
**Covers:** (opens beginner-friendly — what an LLM is, how it answers, 5 use-case patterns with worked implementations) · inference memory anatomy · PagedAttention (OS virtual memory for the KV cache) · prefix caching · static vs continuous batching (the convoy problem) · quantisation ladder + GPTQ/AWQ/SmoothQuant + KV-cache quant · speculative decoding · chunked prefill + disaggregation · TTFT/TPOT/throughput/**goodput** · why uniform synthetic benchmarks mislead · the benchmark harness design
**Deliverable:** `day-04/LLM Inference Internals & Optimisation/` — 2,012 lines, 20 diagrams, benchmark-harness design (feeds Day 07 gate)

### Day 05 — Model Serving in Production ✅
**Covers:**
- vLLM vs TGI vs TensorRT-LLM vs SGLang — selection criteria, not feature lists
- Deployment shapes: real-time, streaming (SSE), async, batch, multi-model endpoints
- LoRA multi-adapter serving in practice
- Autoscaling on the right signal; cold-start reality; warm pools
- Model registry, promotion gates, rollback with a warm previous version

**Deliverable:** `day-05/Model Serving in Production/` — 1,727 lines, 21 diagrams, `code/` with vLLM deployment, smoke test, `bench.py` and a load-shed test
**⚑ Hands-on begins here.**

### Day 06 — GPU Infrastructure on Kubernetes ✅
**Covers:**
- GPU node groups, NVIDIA device plugin, Karpenter provisioners
- Scheduling: bin-packing, taints/tolerations, topology awareness, NVLink/EFA
- MIG vs time-slicing vs exclusive allocation — multi-tenancy models
- Spot/interruption handling; quota and cost showback
- Observability: DCGM, HBM utilisation, the metrics that matter

**Deliverable:** `day-06/GPU Infrastructure on Kubernetes/` — 1,731 lines, 21 diagrams, `code/` with Terraform, Karpenter pools, GPU Operator values, quota/alerts and a chain-verification script
**Why here:** your strongest transfer point — this is EKS work with a GPU-shaped problem.

### Day 07 — LLM Gateway, Cost & Benchmarking ✅ ⟵ **GATE PASSED**
**Covers:**
- Gateway design: auth, token-denominated quotas, routing, failover, caching
- Cost attribution per team / feature / tenant
- Load-testing discipline: realistic prompt and output distributions
- Measuring p50/p95, cost per 1K tokens, cache hit ratio

**Deliverable:** `day-07/LLM Gateway, Cost & Benchmarking/` — 2,551 lines, 22 diagrams, `code/` with a working gateway (auth, token quotas, routing, failover, breakers, cache, ledger), a synthetic upstream, an open-loop load generator, an attribution rollup and 44 policy tests — plus **[`GATE-sprint-1.md`](week-01/day-07/LLM%20Gateway,%20Cost%20&%20Benchmarking/GATE-sprint-1.md)**

**Gate result — PASS (28 Jul 2026).** Workload `wl-2026-07-28.1`, 16 rps open loop, 1,891 requests, 0 errors:
- **TTFT p50 57.4 ms · p95 132.6 ms · p99 255.9 ms** (client-side, schedule lag p95 0.4 ms)
- **Cost $0.001030 per 1K total tokens · $0.005813 per 1K output tokens**
- Cache hit ratio 26.1% overall / 26.4% cacheable · knee measured between 20 and 24 rps
- Three limitations stated on the gate document — the upstream is synthetic, gateway token counts are estimated, and the quota is per-replica

---

# WEEK 2 — Production RAG

> **Gate:** RAG answers with citations from your own corpus; retrieval quality measured (recall@k) against a documented baseline; ADRs for vector store and chunking.

*Goes substantially deeper than Day 02 §13, which was conceptual. Week 2 is implementation with measurements and architecture decision records.*

### Day 08 — Document Ingestion & Chunking ✅
**Covers:**
- Parsing reality, written from scratch in stdlib: PDF as a display list (two-column reading order, tables, running headers, filter chains, **OCR detection**), HTML boilerplate removal, Markdown atomic blocks, code via `ast`, CSV rows
- **The offset contract** — `doc.text[start:end] == chunk.text` — and span-anchored gold labelling, which is what makes chunking strategies comparable at all
- **Nine chunking strategies measured**: 9 × 4 sizes × 2 retrievers × 64 span-anchored queries
- `recall@k` vs **`containment@k`** — the truncation gap, and why recall alone selects the wrong chunker
- Metadata design, ACL tagging (deny by default), document versioning
- Incremental re-indexing, boundary stability, and the freshness SLO computed rather than asserted

**Deliverable:** `day-08/Document Ingestion & Chunking/` — 2,036 lines, 23 diagrams, `code/` (stdlib-only pipeline + eval harness + 3 experiments, 124 assertions) + **[`ADR-001-chunking-strategy.md`](week-02/day-08/Document%20Ingestion%20&%20Chunking/ADR-001-chunking-strategy.md)** — gate artifact

**Measured** ([`code/evidence/`](week-02/day-08/Document%20Ingestion%20&%20Chunking/code/evidence/)): **6 of 9 strategies statistically tied** on retrieval quality (paired bootstrap), so the decision was made on axes nobody benchmarks — the top scorer cuts **31.8%** of the corpus's 622 tables and code blocks; fixed-size chunking re-embeds **100% of a document** (56,010 tokens) for a one-paragraph insert against **84**; its headline recall@10 of 0.844 hides a **0.094** truncation gap. PDF reading order: **4/4 vs 1/4** anchors recoverable. HTML boilerplate: **58.4%** removed. Adopted: `recursive_atomic` @ 448 tokens.

### Day 09 — Embeddings & Vector Stores ✅
**Covers:**
- The encoder as a component with a version, a pooling rule and a hard input limit — and why **every one of its failure modes is silent** rather than throwing
- **HNSW and IVF written from scratch**: the layered graph, the greedy walk, the diversity heuristic that *is* the algorithm; spherical k-means, `nprobe`, and why IVF fails on a cliff where HNSW fails on a slope
- **The two recalls** — index-recall (vs brute force) vs gold-recall (vs labelled spans) — kept strictly apart
- pgvector deployed, with the operator-class trap and the planner's right to refuse an index
- ACLs on an approximate index · the embedding **version trap** · migration as add → backfill → verify → cut over → drop
- Embedding model selection **on your own corpus**, and why a leaderboard would not have predicted this day's result

**Deliverable:** `day-09/Embeddings & Vector Stores/` — 1,746 lines, 23 diagrams, `code/` (ONNX encoder + 4 indexes on one interface + deployed pgvector + 18 assertions, Day 8's harness *imported not copied*) + **[`ADR-002-vector-store-selection.md`](week-02/day-09/Embeddings%20&%20Vector%20Stores/ADR-002-vector-store-selection.md)** — gate artifact

**Measured** ([`code/evidence/`](week-02/day-09/Embeddings%20&%20Vector%20Stores/code/evidence/)): **dense retrieval LOST to Day 8's BM25 baseline** — 0.703 vs **0.859** recall@10 — and Experiment 7 confirmed Day 8's advance prediction for *why*: cut by query/answer term overlap, dense wins the zero-overlap bucket by **+0.143** (n=7) and loses every other bucket. Oracle union **0.9375**, giving Day 10 a **+0.078** measured target rather than an assumption. HNSW **0.9969** index-recall at 574 distance calls vs flat's 1,765; its diversity heuristic is worth 3 points and removes naive selection's zero-recall queries. Under a 1% ACL filter **HNSW scans 102.8% of the corpus** while **IVF returns 2.8 of 10 results** at recall 0.267 — neither degrades gracefully, so tenancy is a *partitioning* decision. Mixing two **384-dim** models loses **79%** of recall with no error (cross-model cosine 0.2204). pgvector+HNSW costs **4,196 bytes/vector — 2.73×** the raw payload. Adopted: pgvector 0.8.5, HNSW, `vector_ip_ops`, fingerprinted vectors.

### Day 10 — Hybrid Retrieval & Reranking ✅
**Covers:**
- Rank fusion and score fusion written from scratch: RRF hand-computed, what `k` actually encodes, min-max vs z-score vs raw, CombMNZ, and the **missing-document decision** that changes results more than the normaliser does
- **The identity problem** — fusing two retrievers over different chunkings produces disjoint `chunk_id` spaces, so RRF silently degrades to an interleave. Span-overlap clustering as the fix, and why the fix measured *worse*
- Cross-encoder reranking: one architectural difference (where the query enters), two consequences (it can condition on the interaction, and it cannot be indexed). `only_second` truncation, real segment ids, and the **rerank ceiling** as arithmetic
- Multi-turn query rewriting — four policies against an **oracle ceiling** — and query decomposition, where RRF is *structurally* the wrong fuser
- A retrieval **latency budget** enforced at request time, with per-stage p50/p95, provenance on every result, and visible degradation

**Deliverable:** `day-10/Hybrid Retrieval & Reranking/` — 2,135 lines, 24 diagrams, `code/` (fusion + ONNX cross-encoder + rewriting + the budgeted service, Days 8 and 9 *imported not copied*, 39 tests / 85 assertions) + **[`ADR-003-retrieval-fusion-and-reranking.md`](week-02/day-10/Hybrid%20Retrieval%20&%20Reranking/ADR-003-retrieval-fusion-and-reranking.md)**

**Measured** ([`code/evidence/`](week-02/day-10/Hybrid%20Retrieval%20&%20Reranking/code/evidence/)): **the day's headline is a negative result with a mechanism.** Fusion's gain tracks the gap between the two retrievers — **25%** of the available headroom recovered when they are 23 points apart, **100% and significant** when they are 1.6 apart. RRF at the industry-default **k=60 cost 7.8 recall points** and got monotonically worse with depth. The arm that topped the table had **stopped fusing** (0.923 overlap with BM25's own top-10, 61/64 identical top-1). Reranking a well-ordered pool netted **exactly 0.0000** — 4 queries up, 4 down — and the cross-encoder scored against **all 1,208 chunks ties BM25** (0.8438 vs 0.8594), which explains every zero. But an elided follow-up costs BM25 **0.3929** and costs dense **nothing**: the two-day lexical advantage (+0.3571, significant) collapses to a tie (−0.0357, ns) in one conversational turn. RRF over decomposed sub-queries is structurally wrong — slot allocation is worth **+0.1724** on two-need queries. The reranker is **>99% of the retrieval budget** on CPU, and the budget check that was meant to contain it **failed on 100% of requests** until its cost estimate was learned rather than hardcoded. Adopted: **BM25 alone** for single-turn traffic, dense index kept, measured and flagged.

### Day 11 — Grounding, Citations & Context Assembly ✅
**Covers:** grounding prompts ablated clause-by-clause · abstention behaviour and its **discrimination**, not just its rate · citation generation, parsing, resolution and **echo correction** · programmatic citation verification as a five-stage funnel · context assembly within a computed token budget · packing rules, ordering and a controlled position sweep · unsupported-claim detection with three detectors · closed-book leakage and context-vs-memory conflict · a real decoder on the CPU with per-token logprobs

**Deliverable:** `day-11/Grounding, Citations & Context Assembly/` — 2,613 lines, 26 diagrams, [ADR-004](week-02/day-11/Grounding,%20Citations%20&%20Context%20Assembly/ADR-004-grounding-citation-and-abstention-policy.md), `code/gen/` + 34 assertions + 7 evidence files

**Measured** ([`code/evidence/`](week-02/day-11/Grounding,%20Citations%20&%20Context%20Assembly/code/evidence/)), on `Qwen2.5-0.5B-Instruct` int8 with a 1.5B probe: **the prompt is not one instruction.** "Use only the context", "say I don't know" and "cite your sources" interfere — adding the refusal clause to a citing prompt **collapses citations 0.312 → 0.016**, and the 1.5B probe shows that collapse is a **capacity artefact** (both variants cite 0.182 at 1.5B). Prompted abstention **does not discriminate**: it refuses 0.5111 of unanswerable and 0.4531 of answerable questions, a lift of **+0.058 whose CI spans zero**, while the decoder's own sequence logprobs reach **AUC 0.72** — so refusal moved from the prompt to a threshold. The grounding clause is the one that earns its place: with the context perturbed to contradict the model, `naive` prefers its **own memory** (0.158 vs 0.105) and `grounded` flips it to **0.368 vs 0.105**, scored by exact match against a value absent from the corpus. **45% of citations are the context block copied back** — found by hand-labelling 42 claims one at a time, invisible in every aggregate because it inflates citation rate *and* deflates support rate; echo-corrected the rate is **0.109**, not 0.312. A **string-containment veto catches 90/90 fabricated numbers** where content overlap catches 4 and a cross-encoder catches 17 with 16 false alarms — and the **LLM judge is the worst detector and the slowest** (F1 0.667 at 260 ms/claim vs 1.000 at 0.062). **Generation is 99.7% of the request**, prefill exceeding decode, per-token prefill cost **+36% from k=1 to k=10**. Ordering and position are **null at this power** — every interval spans zero, and `edges`, the lost-in-the-middle *mitigation*, ranks last. Closed-book leakage is **0/64** at the strict threshold: topical familiarity, not answer knowledge. **Three predictions written into the code before measuring were wrong** and are corrected in place.

### Day 12 — RAG Evaluation & the Recall@k Baseline
**Covers:**
- Building a labelled query set
- **Recall@k, context precision, MRR/NDCG** — measuring retrieval separately from generation
- Groundedness, answer relevance, citation accuracy
- Wiring RAG evals into the promotion pipeline

**Deliverable:** **evaluation harness + documented recall@k baseline** (gate artifact)

### Day 13 — Advanced RAG Patterns
**Covers:**
- Parent-child retrieval, contextual retrieval, HyDE
- Recency weighting, multi-hop and GraphRAG
- Agentic RAG — when the model decides whether to retrieve
- Multi-tenancy and ACL enforcement at retrieval time
- **Framework survey:** LlamaIndex's advanced retrieval abstractions (node parsers, query engines, routers) read against what you built in Days 08–12 — where the abstraction is denser than hand-rolled, and where it hides something you need to control

**Deliverable:** knowledge doc + selected patterns implemented

### Day 14 — RAG on AWS & Build-vs-Buy ⟵ **GATE**
**Covers:**
- Bedrock Knowledge Bases — capabilities and limits
- OpenSearch Serverless, Kendra — where each fits
- Build vs buy: the honest cost and control analysis
- Consolidating the sprint's ADRs

**Deliverable:** comparison writeup + **gate review**: cited answers, recall@k vs baseline, both ADRs signed off

---

# WEEK 3 — Agents & LLMOps

> **Gate:** An agent completes a multi-step infrastructure task with approval gates; every request is traced; the eval suite runs in CI with scores.

### Day 15 — Tool Use & Function Calling
**Covers:**
- Tool definition, schemas, strict/constrained tool calling
- The agent loop: model proposes, orchestrator disposes
- Parallel tool calls; error handling and retry semantics
- MCP (Model Context Protocol) and the N×M integration problem
- **Framework contrast (timeboxed ~1h, after yours works):** the same tool surface re-expressed in LangChain — what the abstraction buys, what it hides (prompt construction, retry semantics, token accounting)

**Deliverable:** tool-calling service with a defined tool surface
**Order matters:** build it raw first. The contrast is only instructive once you know what is underneath it.

### Day 16 — Agent Architectures & Orchestration
**Covers:**
- Single call → workflow → agent → multi-agent: choosing the right tier
- Planning, reflection, and when they earn their cost
- State, memory and context management across long runs
- Iteration caps, token budgets, termination conditions
- **Build vs adopt:** the same agent re-implemented as a LangGraph state graph — nodes/edges, checkpointed state, `interrupt` for human-in-the-loop. Its model maps closely onto your runtime and onto Day 17's approval gates, which is what makes the comparison worth the hours.

**Deliverable:** agent runtime — extends the BMS orchestration narrative
**Deliverable:** **ADR: build vs adopt for agent orchestration** — your runtime vs LangGraph, decided on operability grounds (tracing, state durability, failure containment, upgrade risk), not feature count

### Day 17 — Agent Safety: Guardrails, Approvals & Sandboxing
**Covers:**
- **Prompt injection** — direct and indirect; why it is not solved
- Least-privilege tool design as the real security boundary
- Human-in-the-loop approval gates for irreversible actions
- Sandboxing, egress control, credential isolation

**Deliverable:** guardrail layer + approval workflow

### Day 18 — Prompt Engineering & Management at Scale
**Covers:**
- Prompts as versioned production code
- Prompt registry, A/B testing, staged rollout
- Cache-efficient prompt ordering; token accounting per prompt version
- Prompt regression testing

**Deliverable:** prompt management service

### Day 19 — LLM Observability & Tracing
**Covers:**
- Full request tracing: prompt, retrieved chunks, tool calls, response, cost
- OpenTelemetry for LLM workloads; span design
- Token-denominated metrics; cost attribution
- **Detecting silent quality degradation** — the failure that returns 200 OK
- **Framework-mediated tracing:** LangSmith vs your OTel spans — what you lose in vendor-neutrality, what you lose in visibility when the framework builds the prompt for you

**Deliverable:** tracing and metrics pipeline

### Day 20 — Evaluation Harness & LLM-as-Judge
**Covers:**
- The five-layer stack: deterministic → golden set → judge → human → production signals
- LLM-as-judge bias mitigation: position, verbosity, self-preference; calibration against humans
- Golden dataset construction and maintenance
- Production feedback loops

**Deliverable:** evaluation harness with scored runs

### Day 21 — CI/CD for LLM Systems ⟵ **GATE**
**Covers:**
- Evals as a promotion gate in the pipeline
- Shadow deployment, canary, rollback for models and prompts
- Regression suites; drift detection in CI
- Change management: model, prompt, and parameter changes

**Deliverable:** **gate review** — agent completes a multi-step task with approvals; full tracing; evals scoring in CI

---

# WEEK 4 — MLOps & Kubernetes for AI at Scale

> **Gate:** Platform review passes production-readiness ≥ 85/100; scale and failure narrative documented.

### Day 22 — Multi-Tenancy & Isolation
**Covers:**
- Four isolation boundaries: data, model, prompt/config, cost
- Per-tenant indexes vs shared with filtering
- Noisy-neighbour protection; per-tenant quotas
- Cross-tenant cache poisoning and how to avoid it

**Deliverable:** multi-tenant design + implementation

### Day 23 — GPU Scheduling, Bin-packing & Karpenter
**Covers:**
- Karpenter provisioners and consolidation for GPU workloads
- Bin-packing strategies; fragmentation
- Priority classes, preemption, gang scheduling
- Cost showback and chargeback models

**Deliverable:** GPU scheduling policies in the cluster

### Day 24 — Fine-Tuning & Adapter Lifecycle
**Covers:**
- LoRA/QLoRA in production; dataset curation as 80% of the work
- Training job orchestration; experiment tracking
- Adapter registry, versioning, lineage
- Multi-adapter serving at scale; evaluation before promotion

**Deliverable:** fine-tuning pipeline + adapter registry

### Day 25 — Distributed Training Infrastructure
**Covers:**
- Data, tensor and pipeline parallelism; FSDP/DeepSpeed ZeRO
- NCCL, EFA, collective communication; interconnect sizing
- Checkpointing, spot interruption, job resumption
- High-throughput storage (FSx for Lustre) — keeping GPUs fed

**Deliverable:** training cluster design + a run
**Why here:** most organisations never build this — but you will be asked to design it.

### Day 26 — Model Registry, Lineage & Governance
**Covers:**
- Model as a build artifact: versioning, lineage, immutability
- Promotion gates, approval workflows, audit trail
- Model cards, documented limitations, intended use
- SageMaker Model Registry vs MLflow vs alternatives

**Deliverable:** registry with promotion gates wired in

### Day 27 — Security, Compliance & Data Governance
**Covers:**
- Threat model: injection, exfiltration, jailbreaking, PII leakage, supply chain
- Data residency, retention, right-to-erasure (including the vector index)
- GDPR / India DPDP implications for LLM systems
- Responsible AI: fairness measurement, proxy features, human agency

**Deliverable:** security and governance writeup + controls implemented

### Day 28 — Reliability: DR, Capacity & Incident Response ⟵ **GATE**
**Covers:**
- Capacity planning end to end; GPU supply risk; multi-region
- Graceful degradation: queueing, model fallback, load shedding
- DR posture; RTO/RPO for AI systems
- Incident response for silent failures; runbooks

**Deliverable:** **production-readiness review ≥ 85/100** + scale/failure narrative

---

# WEEK 5 — AI System Design + Interview Sprint

> **Gate:** 2 full mock loops scored ≥ 4/5 average; all readiness dimensions ≥ 3.5.
> **Feature freeze.** No new platform building — consolidate and articulate.

### Day 29 — The AI System Design Framework
**Covers:**
- A repeatable structure: requirements → scale → architecture → deep dive → trade-offs → failure modes
- Capacity estimation on a whiteboard: tokens, KV cache, GPUs, cost
- How AI system design differs from classic distributed-systems design
- Common traps and how interviewers probe

**Deliverable:** the framework, written down and rehearsed

### Day 30 — System Design: Enterprise RAG Platform
**Covers:** multi-tenant RAG at 10k users · ingestion at scale · ACL enforcement · freshness · evaluation · cost model
**Deliverable:** full writeup + diagrams, defended aloud

### Day 31 — System Design: Multi-Tenant LLM Serving
**Covers:** gateway · routing · GPU fleet sizing · KV-cache-driven capacity · autoscaling · per-tenant isolation · cost attribution
**Deliverable:** full writeup + diagrams

### Day 32 — System Design: Agent Platform
**Covers:** tool registry · sandboxing · approval workflows · tracing · state management · failure containment
**Deliverable:** full writeup + diagrams

### Day 33 — System Design: ML Platform & Training Infrastructure
**Covers:** feature store · training orchestration · experiment tracking · model registry · GPU scheduling · the classic-ML surface that still gets asked
**Deliverable:** full writeup + diagrams

### Day 34 — Behavioural & Principal-Level Narrative
**Covers:**
- The 14-year story reframed for AI platform roles
- Leadership, influence, disagreement, technical judgement
- STAR bank for scope, ambiguity, failure, mentorship
- The "why should we hire a DevOps person for an AI role" answer

**Deliverable:** rehearsed narrative + STAR bank

### Day 35 — Mock Interview Loop 1 ⟵ **GATE**
**Covers:** full loop — coding/practical, system design, deep technical, behavioural
**Deliverable:** **scored transcript + gap analysis**

---

# WEEK 6 — Consolidation & Sign-off

> **Gate:** Resume frozen; weighted readiness ≥ 4.0; AventiqLab content inventory complete.

### Day 36 — Mock Interview Loop 2 + Gap Analysis
**Covers:** second full loop, different interviewer stance · scoring against the rubric · ranked weak areas
**Deliverable:** second scored transcript + prioritised remediation list

### Day 37 — Weak-Area Remediation *(adaptive)*
**Covers:** whatever Days 35–36 exposed. Content decided by the gap analysis, not pre-planned.
**Deliverable:** targeted drills + re-test on the weak dimensions

### Day 38 — Portfolio & Flagship Repo Polish
**Covers:** README quality · architecture docs and ADRs · diagrams rendered · runbooks · demo path · commit history that reads well
**Deliverable:** `aventiq-ai-platform` presentable to an interviewer

### Day 39 — Resume, LinkedIn & Positioning
**Covers:** resume rewrite around platform-for-AI framing · quantified impact · LinkedIn · the 90-second introduction
**Deliverable:** **resume frozen**

### Day 40 — Company-Specific Preparation
**Covers:** per-target research — Amazon (LP bar-raiser), NVIDIA (systems depth), Databricks/Snowflake (data platform angle), Microsoft, Uber, ServiceNow, Salesforce · tailoring the narrative per company
**Deliverable:** per-company prep sheets

### Day 41 — Final Mock Loop + Readiness Scoring
**Covers:** full loop under realistic conditions · scoring across all readiness dimensions
**Deliverable:** **final scorecard**

### Day 42 — Sign-off & Forward Plan
**Covers:** readiness sign-off · AventiqLab content inventory · what to keep drilling during the interview period · spaced-repetition schedule
**Deliverable:** sign-off record + maintenance plan

---

## Prerequisite Chains

Where order genuinely matters:

```
01 Neural Networks
  └→ 02 Generative AI
       └→ 03 Transformers ──→ 04 Inference Internals ──→ 05 Serving ──→ 07 Gateway
                                                            └→ 06 GPU Infra ──┘

08 Ingestion ──→ 09 Embeddings ──→ 10 Retrieval ──→ 11 Grounding ──→ 12 Evaluation
                                                                        └→ 13, 14

15 Tool Use ──→ 16 Agents ──→ 17 Safety
                   └→ 19 Observability ──→ 20 Evaluation ──→ 21 CI/CD

22–28 (Week 4) assume Weeks 1–3 are built — they harden what exists
29–35 (Week 5) assume the platform is complete — feature freeze
36–42 (Week 6) is adaptive; content set by mock-loop gaps
```

---

## Structural Conventions

**Folder layout** *(established Day 01–03)*:

```
learning/week-NN/day-NN/<Human Readable Topic>/
├── deep-dive-<topic-slug>.md
├── diagrams/NN-<name>.mmd
└── code/                        ← from Day 05 onward
```

**Week/day numbering:** days run continuously 01–42; week folders group them. Day 08 lives at `learning/week-02/day-08/…`.

**Per-day document shape:** concepts → hand-worked numeric examples → production/platform perspective → interview questions (20 beginner + 20 intermediate + 10 principal, with full answers) → common mistakes → mental models → cheat sheet → 50 flashcards → summary → diagram index.

**Gate days** (07, 14, 21, 28, 35, 42) produce a *reviewable artifact*, not just a document.

---

## Where the Balance Shifts

| Days | Mode | Output |
|---|---|---|
| **01–04** | Knowledge-heavy | Deep-dive documents — building the mental model |
| **05–28** | Build-heavy | Documents **+ working code** on the flagship platform |
| **29–35** | Articulation | System-design writeups, defended aloud |
| **36–42** | Consolidation | Mocks, remediation, portfolio, positioning |

**Day 05 is the pivot.** Days 01–04 establish why things cost what they cost; from Day 05 the platform gets built.

---

## The Re-Scoping Rule

Per Blueprint §4: **a missed gate never slips the deadline — it shrinks scope.** Each sprint has a pre-agreed cut list decided at the Saturday gate check and recorded in the retro.

Realistically, the most likely cuts:

| Sprint | First thing to drop |
|---|---|
| 1 | Self-hosted serving depth — lean on managed APIs |
| 2 | GraphRAG and agentic RAG (Day 13) |
| 3 | The framework comparisons (Days 15/19), then multi-agent orchestration (part of Day 16) |
| 4 | Distributed training (Day 25) — design it, don't build it |
| 5 | One of the four system designs |

Cutting Day 25 to a design exercise is the single highest-value cut available: most organisations never build a training cluster, but you will be asked to design one.

**On the framework work (Days 13, 15, 16, 19):** it is deliberately additive and cuttable. The curriculum teaches the primitives a framework wraps — you build the tool loop, the agent runtime, the retrieval stack and the tracing yourself. The framework passes exist so you can answer *"why did you not use LangGraph"* from experience rather than from principle, and so LangChain/LangGraph/LlamaIndex/LangSmith are not blanks on your resume. If Week 3 runs tight, cut the comparisons before cutting your own implementations — the hand-built layer is what the interview rewards. The Day 16 ADR is the one worth protecting: it is a portfolio artifact, not a tutorial.

---

<div align="center">

**AventiqLab · AI Platform Engineering Mastery**
42-Day Roadmap · Version 1.0

*Current position: Day 04 complete · Next: Day 05 — Model Serving in Production*

</div>
