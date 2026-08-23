# Video Script — "Why Pod Autoscaling Can Still Leave You Stuck"

Artifact: [`art-inference-under-load-video`](../artifacts/art-inference-under-load-video.yaml) · Experience: [`exp-inference-under-load`](../experience.yaml) · Narrative plan: [`video-narrative-plan.md`](video-narrative-plan.md) · Duration: **5:29** (30fps, 9,870 frames) — timed to the actual generated voiceover, not a fixed target

This is the finished narration script and shot list for the version of this video built against `docs/video-artifact-constitution.md`'s full ten-stage reasoning spine (Problem → Stakes → Curiosity → Context/Mental Model → Options → Trade-offs → Investigation/Demonstration → Decision → Best Practice → Takeaway), with all ten stages treated as REQUIRED per this reference build's own decision (see [`video-narrative-plan.md`](video-narrative-plan.md)). It is the source of truth the `video-studio` Remotion composition (`InferenceUnderLoad`) is built from. If you edit the narration: edit this file's text, regenerate the voiceover with `npm run generate:audio -- inferenceUnderLoadScript` (from `video-studio/`), then update the `start`/`duration` values in `video-studio/src/data/inferenceUnderLoadScript.ts` to match each beat's new audio length (see Production notes below).

**Why this version exists:** the prior 6-act cut had no cold-open Problem, put Curiosity after the mental model instead of before it, never named the CPU-based HPA as a rejected alternative (no Options stage), stated the KEDA/Karpenter division of labor as one buried sentence rather than a structured Trade-offs comparison, and never crystallized a standalone Decision or Best Practice line. This version fixes all five gaps — see [`video-narrative-plan.md`](video-narrative-plan.md) for the full before/after reasoning.

Format per beat: **[start–end] ON SCREEN / SUBTITLE**

---

## STAGE 1 — Problem

### Beat 1 — Title (0:00–0:07)
**ON SCREEN:** Title card. "Why Pod Autoscaling Can Still Leave You Stuck." Sub-line: "Why can pod autoscaling still fail when a GPU workload needs additional node capacity?"

**SUBTITLE:** *(no voiceover on the title card)*

### Beat 2 — The failing situation (0:07–0:18.3)
**ON SCREEN:** `StatementCard`. Eyebrow "THE PROBLEM" (red). Statement: "Users of your GPU inference service are seeing slow responses." Support line: "Traffic climbed. Pods are scaling. Latency keeps getting worse anyway."

**SUBTITLE:**
> "Your GPU inference service is falling behind. Traffic climbed a while ago, the pods have been scaling the whole time, and responses are still getting slower."

---

## STAGE 2 — Stakes

### Beat 3 — What breaks (0:18.3–0:33.2)
**ON SCREEN:** `StatementCard`. Eyebrow "WHAT BREAKS IF THIS STAYS BROKEN" (amber). Statement: "Queue depth grows → latency rises → requests start timing out → users see failures." Support: "This is a paid-tier feature. A sustained SLA breach isn't a metric — it's a contractual problem."

**SUBTITLE:**
> "Here's why it matters. Queue depth keeps growing, latency keeps rising, and eventually requests start timing out — users just see failure. This is a paid-tier feature with a real SLA, so this isn't just an ugly graph."

---

## STAGE 3 — Curiosity

### Beat 4 — The confusing part (0:33.2–0:44.1)
**ON SCREEN:** `StatementCard`. Eyebrow "THE QUESTION" (blue). Statement: "CPU on these pods is sitting at 35%. So why are we falling behind?"

**SUBTITLE:**
> "Here's the confusing part. CPU on these pods is sitting at 35 percent — nowhere near maxed out. So why is the service still falling behind?"

---

## STAGE 4 — Context / Mental Model

### Beat 5 — Request path (0:44.1–0:56.6)
**ON SCREEN:** Architecture diagram builds in: Users → ALB → Service → Inference Pod, traveling-dot traffic flow.

**SUBTITLE:**
> "To answer that, let's look at what's actually inside the cluster. A request arrives through a load balancer, hits a Kubernetes Service, and gets forwarded to one of the inference pods."

### Beat 6 — The application layer (0:56.6–1:08.2)
**ON SCREEN:** Diagram extends to GPU, highlighted with a blue glow.

**SUBTITLE:**
> "Each pod runs the model-serving process, and that process runs on a GPU. This is where the actual inference happens — and where the real bottleneck usually lives."

### Beat 7 — KEDA and the Scheduler (1:08.2–1:20.9)
**ON SCREEN:** KEDA and Scheduler nodes fade in below the main chain, Scheduler highlighted.

**SUBTITLE:**
> "So CPU was never the signal that mattered here. Something else controls how many pods we have — that's KEDA. And something else decides where those pods actually run — that's the scheduler."

### Beat 8 — Karpenter (1:20.9–1:32.5)
**ON SCREEN:** Karpenter node fades in, highlighted with a blue glow.

**SUBTITLE:**
> "And one more piece: Karpenter. It provisions new node capacity when the cluster needs it. Keep these three separate in your head — that's the whole answer to why this can still break."

---

## STAGE 5 — Options

### Beat 9 — The obvious first instinct (1:32.5–1:44.8)
**ON SCREEN:** Single-column `OptionsCompare` card: "HPA (CPU-based)" — Solves: "Scales replica count based on CPU utilization — the default, well-known mechanism." Does not solve: "Doesn't reflect demand for this workload — CPU stays low even while the queue backs up."

**SUBTITLE:**
> "Before going further — the obvious first instinct here is a CPU-based HPA. It's the default, well-known mechanism for pod autoscaling. So why isn't that the answer?"

---

## STAGE 6 — Trade-offs

### Beat 10 — The real three-way split (1:44.8–2:02.3)
**ON SCREEN:** Two-column `OptionsCompare` card, both highlighted (favored): "KEDA (queue-depth)" — Solves: "Scales replica count from a signal that actually reflects demand." Does not solve: "Cannot create GPU node capacity." | "Karpenter" — Solves: "Provisions new GPU node capacity when the cluster is out of room." Does not solve: "Has no opinion on how many replicas the application needs."

**SUBTITLE:**
> "Here's the real three-way split. KEDA can react to queue depth instead of CPU — a better signal, but it still only controls replica count. Karpenter controls node capacity, but it has no opinion on how many replicas you need. Neither one does the other's job."

---

## STAGE 7 — Investigation / Demonstration

**This stage is one continuous scene (2:02.3–3:26, `InvestigationScene.tsx`), not six cuts.** All six moments below play inside a single Remotion `<Sequence>` driven by one shared keyframe timeline — `useCurrentFrame()` never resets mid-story, so every number tweens continuously from one moment's value to the next instead of snapping, pods spawn/despawn as individually animated elements rather than swapping between static per-moment snapshots, and the camera (`CameraFrame`) pans/zooms across the scene to whatever's currently relevant (stat tiles → SQS queue → pending pods → the new node joining → pulling back out for recovery). The six segments below are the narration/caption boundaries within that one scene, not separate beats — see the "Numbers that change must animate through the change" rule in `docs/video-artifact-constitution.md` §5 for why this mattered.

### Segment 1 — Healthy baseline (2:02.3–2:14.8)
**ON SCREEN:** Architecture diagram + live metrics tiles: Traffic 100 req/s, Pods 4, Nodes 2, GPU 45%, SQS queue empty.

**SUBTITLE:**
> "Here's the system running normally. A hundred requests a second, four pods, two nodes. GPU utilization is comfortable, and there's no queue. Nothing is under pressure."

### Segment 2 — KEDA scales (2:14.8–2:30.4)
**ON SCREEN:** Camera pushes in on the metrics tiles. Traffic counts up toward 600 req/s (amber), Pods count up 4→8, GPU% climbs toward 78% (amber), SQS queue fill-blocks and counter tick up. KEDA highlighted.

**SUBTITLE:**
> "Now traffic starts climbing — 200, then 400, then 600 requests a second. GPU utilization is rising with it. And KEDA is doing exactly what it should: scaling the application layer to keep up."

### Segment 3 — Pressure builds (2:30.4–2:44.6)
**ON SCREEN:** Traffic continues counting up toward 950 req/s (red), Pods 8→12, GPU% toward 96% (red), SQS queue continues filling toward its highest point.

**SUBTITLE:**
> "Traffic keeps climbing. GPU utilization, queue depth, and latency are all rising together now. KEDA keeps doing its job — creating more pods to meet demand: ten, then twelve replicas."

### Segment 4 — Pending (2:44.6–2:59.2)
**ON SCREEN:** Both GPU node capacity meters tween to "FULL" (red). Camera settles on the pending-pods region as two dashed, pulsing "Pending" pods (pod-13, pod-14) spawn in at this exact moment, not before. SQS queue holds near its peak (44 msgs).

**SUBTITLE:**
> "And here's the moment that matters. Both GPU nodes are full. KEDA successfully created two more pods — but Kubernetes cannot place them, because there's no available GPU capacity left. They sit there, Pending. The queue keeps climbing right along with them."

### Segment 5 — Karpenter provisions (2:59.2–3:14)
**ON SCREEN:** Camera pans toward the new node. Third GPU node fades/scales in, "joining," fills toward 40%. The two Pending pods despawn and reappear as solid green "Scheduled — Running" cards at the same moment the node finishes joining.

**SUBTITLE:**
> "This is where Karpenter takes over. It sees pods that can't be scheduled because the cluster is out of room, and provisions a new GPU node sized to fit them. Once that node joins the cluster, the pending pods get scheduled."

### Segment 6 — Recovery (3:14–3:26)
**ON SCREEN:** Camera pulls back out to the full scene. All three node meters tween down to settled levels (82%, 78%, 55%). Traffic, GPU%, and SQS queue all count back down (green) as the system recovers.

**SUBTITLE:**
> "KEDA solved pod demand. Karpenter solved infrastructure capacity. With both pieces in place, queue depth and latency recover, and the system settles back to healthy."

---

## STAGE 8 — Decision

### Beat 17 — So the decision is this (3:26–3:43.9)
**ON SCREEN:** `StatementCard`. Eyebrow "THE DECISION" (blue). Statement: "Run KEDA and Karpenter together — not one instead of the other." Support: "KEDA owns replica count because queue depth is the honest signal here. Karpenter owns node capacity, a completely different resource."

**SUBTITLE:**
> "So the decision is this: KEDA owns replica count, because queue depth is the honest signal for this workload. Karpenter owns node capacity, because that's a completely different resource. Running both together — not one instead of the other — is what actually closes the gap."

---

## STAGE 9 — Best Practice

### Beat 18 — The rule worth keeping (3:43.9–3:55.4)
**ON SCREEN:** `StatementCard`. Eyebrow "BEST PRACTICE" (green). Statement: "Replicas increasing, pods still Pending? Check node capacity before tuning the scaler."

**SUBTITLE:**
> "Here's the rule worth keeping. If replicas are increasing but pods remain Pending, don't tune the pod scaler harder — check node capacity and the scheduler first."

---

## STAGE 7 (continued) — Expert reasoning, reused

### Beat 19 — Early symptoms (3:55.4–4:12.3)
**ON SCREEN:** Grafana-style dashboard for a *different* service — "doc-search-summarizer" — p99 latency, GPU utilization, queue depth all climbing. "P2 — Latency SLO burn rate elevated" banner.

**SUBTITLE:**
> "Now let's watch how an experienced platform engineer investigates a similar production symptom. It's 2:14pm. doc-search-summarizer just paged — p99 latency, GPU utilization, and queue depth are all climbing at once."

### Beat 20 — GPU utilization first (4:12.3–4:29.2)
**ON SCREEN:** Dashboard zooms into GPU utilization; a second panel shows GPU memory (flat).

**SUBTITLE:**
> "First check: GPU utilization, not queue depth, not latency. It's climbing toward 90%, and GPU memory is flat. Flat memory plus rising utilization points at compute saturation — the GPU is doing as much work as it can."

### Beat 21 — Ruling out the network (4:29.2–4:45.2)
**ON SCREEN:** Ingress/load-balancer dashboard: request rate, error rate, ingress latency all flat.

**SUBTITLE:**
> "Rising latency could also mean a network problem. Quick check of the ingress dashboard: request rate is flat, error rate is flat, ingress latency contribution is basically zero. That rules out the network as the cause."

### Beat 22 — Checking KEDA's ceiling (4:45.2–5:00.3)
**ON SCREEN:** Terminal: `kubectl get scaledobject` / `kubectl get deploy`, showing 12/12 replicas.

**SUBTITLE:**
> "Checking whether autoscaling is even still working — kubectl get scaledobject. It's active, and it's already at its configured maximum: twelve out of twelve replicas. KEDA did its job. It's just already maxed out."

### Beat 23 — Applying the mitigation (5:00.3–5:15.5)
**ON SCREEN:** Terminal: editing and applying `gateway-rate-limits.yaml`, 40% free-tier reduction.

**SUBTITLE:**
> "With the replica ceiling already hit and the node pool at capacity, scaling further isn't an option right now. What I can do immediately is reduce demand — a rate limit that cuts free-tier volume by 40% for the next hour."

---

## STAGE 10 — Takeaway

### Beat 24 — The recap (5:15.5–5:29)
**ON SCREEN:** Recap card, three lines: KEDA / Karpenter / Scheduler, each with the question it answers.

**SUBTITLE:**
> "Pod scaling and infrastructure scaling solve different problems. KEDA asks how many replicas we need. Karpenter asks whether we have the capacity to run them. The scheduler decides where they actually go."

---

## Production notes

- **Voiceover:** generated locally with [Chatterbox V3](https://github.com/resemble-ai/chatterbox) via `npm run generate:audio -- inferenceUnderLoadScript` — a fully offline neural TTS engine, no cloud service, no API key. On-screen subtitles carry the same text as plain, unlabeled captions (no "NARRATION:"/"CAPTION:" prefix) per the constitution's Subtitle Rule.
- **Why the durations look specific (11.3s, 14.9s, 10.9s...):** each beat's duration is the actual measured length of its generated audio clip plus a ~3s buffer. Run `generate:audio` again after editing narration text, read the new duration from the printed output or `inferenceUnderLoadScript.manifest.json`, and update that beat's `duration` in `inferenceUnderLoadScript.ts` to match.
- Generated `.wav` files live in `video-studio/public/audio/` and are gitignored (regenerate rather than commit, same as the rendered `.mp4`).
- Two new visual components were added for this build: `StatementCard` (single-sentence beats: Problem, Stakes, Curiosity, Decision, Best Practice) and `OptionsCompare` (the "solves / doesn't solve" comparison cards for Options and Trade-offs). Both are topic-blind — driven entirely by props, no EKS-specific strings in their own source — per the constitution's §5 visual-grammar rule.
- Service name "doc-search-summarizer" (Stage 7's reused expert-reasoning sub-story) is fictional and deliberately *different* from the learner's own `exp-inference-under-load` scenario — this is what makes it a *model of reasoning* to transfer, not a walkthrough of the learner's exact incident.
