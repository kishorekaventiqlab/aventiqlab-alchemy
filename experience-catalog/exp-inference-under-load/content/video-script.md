# Video Script — "Watching an Expert Diagnose a GPU Saturation Incident"

Artifact: [`art-inference-under-load-video`](../artifacts/art-inference-under-load-video.yaml) · Experience: [`exp-inference-under-load`](../experience.yaml) · Duration: **4:07** (30fps, 7,410 frames) — timed to the actual generated voiceover, not a fixed target

This is the finished narration script and shot list — word-for-word narration, timed to the second, with on-screen action notes. It is the source of truth the `video-studio` Remotion composition (`InferenceUnderLoad`) is built from. If you edit the video: edit this file's narration text, regenerate the voiceover with `video-studio/scripts/generate-audio.ps1`, then update the `start`/`duration` values in `video-studio/src/data/inferenceUnderLoadScript.ts` to match each beat's new audio length (see Production notes below for why durations are audio-driven, not hand-picked).

Format per beat: **[start–end] ON SCREEN / NARRATION**

---

## Beat 1 — Cold open (0:00–0:06)
**ON SCREEN:** Title card. "Watching an Expert Diagnose a GPU Saturation Incident." Sub-line: "A different service. A similar problem. Watch how the investigation actually happens."

**NARRATION:** *(no voiceover on the title card — it's on screen just long enough to read before Beat 2's narration starts)*

---

## Beat 2 — Early symptoms (0:06–0:37)
**ON SCREEN:** A Grafana-style dashboard mockup for a *different* service — "doc-search-summarizer" — showing three stacked panels: p50/p99 latency (p99 climbing), GPU utilization (rising toward 90%), request queue depth (climbing). A PagerDuty-style banner appears: "P2 — Latency SLO burn rate elevated."

**CAPTION (narration text on screen):**
> "It's 2:14pm. doc-search-summarizer just paged. p99 latency is climbing, and it's not alone — GPU utilization on its node pool is climbing too. Queue depth is climbing. Three things going up at once. Before touching anything, the question is: which of these is the cause, and which are just symptoms?"

---

## Beat 3 — Check GPU utilization first, and explain why (0:37–1:19)
**ON SCREEN:** Dashboard zooms into the GPU utilization panel. A cursor hovers over the rising line. A second, smaller panel appears beside it: GPU memory utilization (flat, not climbing).

**CAPTION:**
> "First check: GPU utilization, not queue depth, not latency. Here's why — GPU utilization tells you if the compute itself is the bottleneck. It's climbing toward 90%, and GPU memory is flat. That combination matters: if memory were also climbing, I'd suspect a batch-size or memory-leak problem. Flat memory plus rising utilization points at compute saturation — the GPU is doing as much work as it can, and it's running out of headroom."

---

## Beat 4 — Ruling out a network explanation (1:19–1:53)
**ON SCREEN:** Switch to an ingress/load-balancer dashboard mockup: request rate (flat, no spike), 5xx error rate (flat, near zero), ingress latency contribution (flat, near zero).

**CAPTION:**
> "Rising latency could also mean a network problem — a bad ingress config, a DNS issue, a load balancer having a bad day. Quick check of the ingress dashboard: request rate is flat, not spiking. Error rate is flat. Ingress-layer latency contribution is basically zero. That rules out the network as the cause. It's not what's sending the traffic — it's what's receiving it."

---

## Beat 5 — Confirming queue depth trend (1:53–2:23)
**ON SCREEN:** Back to the queue-depth panel, now with a wider time window showing the full climb — not just the current spike, but the last 20 minutes, still trending up with no sign of leveling off.

**CAPTION:**
> "One more check before deciding anything: is queue depth still climbing, or has it started to level off on its own? Widening the window — it's been climbing steadily for the last twenty minutes with no plateau. That matters. If it had leveled off, this might resolve itself. It hasn't. This needs an active decision, not a wait-and-see."

---

## Beat 6 — kubectl check: KEDA replica status (2:23–2:54)
**ON SCREEN:** Terminal mockup. Typed command: `kubectl get scaledobject doc-search-summarizer -n inference`. Output shows `READY: True`, `ACTIVE: True`, current replicas at `maxReplicaCount: 12/12`.

**CAPTION:**
> "Checking whether autoscaling is even still working — `kubectl get scaledobject`. It's active, and it's already at its configured maximum: twelve out of twelve replicas. KEDA is doing its job. It's just already maxed out. That's a different problem than 'autoscaling is broken' — it's 'autoscaling is working, and the ceiling is too low for right now.'"

---

## Beat 7 — Choosing the mitigation, and saying the tradeoff out loud (2:54–3:44)
**ON SCREEN:** Terminal mockup. A rate-limit config file opens (`gateway-rate-limits.yaml`), a diff is applied adding a `free-tier: 40% reduction` rule. Command: `kubectl apply -f gateway-rate-limits.yaml`. Dashboard cuts back in briefly: queue depth line starts to flatten.

**CAPTION:**
> "With the max replica ceiling already hit, scaling further isn't an option right now — that's a capacity conversation for after the incident. What I can do immediately is reduce demand. This service has a free tier and a paid tier. I'm applying a rate limit that cuts free-tier request volume by 40% for the next hour. That's the tradeoff, said out loud: free-tier users see more '429 - try again shortly' responses for a while, in exchange for paid-tier latency staying inside SLA. It's not free. It's a choice, and I'm making it deliberately, not by default."

---

## Beat 8 — Outro / recap (3:44–4:07)
**ON SCREEN:** Recap card, three lines appearing in sequence:
1. "Checked GPU utilization + memory first — compute-bound, not memory-bound."
2. "Ruled out network using the ingress dashboard before assuming GPU."
3. "Chose a mitigation with a named tradeoff, not an unqualified fix."

**CAPTION:**
> "Three things worth taking with you: check the signal that actually tells you where the bottleneck is, rule out the tempting alternative explanation before committing, and when you mitigate, say the tradeoff out loud — don't just apply a fix and hope nobody asks what it cost."

---

## Production notes
- **Voiceover:** generated locally with Windows' built-in SAPI text-to-speech (`Microsoft David Desktop`, en-US) via `video-studio/scripts/generate-audio.ps1` — no cloud TTS service, no API key, no internet dependency. It's a synthetic voice, not a human recording; on-screen captions still carry the same text so the video works with sound off.
- **Why the durations look oddly specific (31s, 42s, 34s...):** each beat's duration is the actual measured length of its generated audio clip plus a ~3s buffer, not a hand-picked round number. Run `generate-audio.ps1` again after editing narration text, read the new duration it prints for each beat, and update that beat's `duration` in `inferenceUnderLoadScript.ts` to match — otherwise the visual will run on after the voice stops (or cut off before it finishes).
- Generated `.wav` files live in `video-studio/public/audio/` and are gitignored (regenerate them from the script rather than committing the binaries — same treatment as the rendered `.mp4`).
- All dashboards, terminals, and PagerDuty banners are original mockups built as React components in `video-studio/` — no real screenshots, no real customer data.
- Service name "doc-search-summarizer" is fictional and deliberately *different* from the learner's own `exp-inference-under-load` scenario (a summarization feature) — this is what makes it a *model of reasoning*, not a walkthrough of the learner's exact incident, per the artifact's stated purpose.
