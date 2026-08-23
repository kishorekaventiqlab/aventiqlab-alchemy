# Video Script — "Watching a Chart Get Adapted for GPU Scheduling"

Artifact: [`art-deploy-inference-service-video`](../artifacts/art-deploy-inference-service-video.yaml) · Experience: [`exp-deploy-inference-service`](../experience.yaml) · Target duration: ~8:00

Finished narration script and shot list — screencast format, on-screen action notes paired with word-for-word narration. Service name and scenario are deliberately different from the learner's own sentiment-analysis deployment, per the artifact's stated purpose: this models the *reasoning process*, not a walkthrough of the learner's exact chart.

Format per beat: **[approx. timing] ON SCREEN / NARRATION**

---

## Beat 1 — Cold open (0:00–0:20)

**ON SCREEN:** Title card. "Watching a Chart Get Adapted for GPU Scheduling." Sub-line: "A different model. A similar chart. Watch how the checks happen before anything gets applied."

**NARRATION:**
> "We've got a CPU-only Helm chart that's worked fine for months, and a new model that needs a GPU. Same chart, new requirement. Let's adapt it — and the point isn't just what changes, it's what I check *before* I change anything."

---

## Beat 2 — Starting point: the existing chart (0:20–1:10)

**ON SCREEN:** Editor showing `values.yaml` for an existing service, `fraud-scoring-api` — a CPU-based Deployment with no `nodeSelector`, no `tolerations`, no `resources.limits` for GPU.

**NARRATION:**
> "Here's the chart as it stands — `fraud-scoring-api`, currently CPU-only. No node selector, no tolerations, no GPU resource request, because it's never needed one. If I just swap the container image for the new GPU-based model and deploy this as-is, here's what happens: the scheduler has no reason to avoid a random CPU node, the pod lands there, and it crashes on startup because there's no GPU to attach to. So before touching the chart, I need to know what the target node pool actually looks like."

---

## Beat 3 — Checking the node pool's taints before writing anything (1:10–2:40)

**ON SCREEN:** Terminal. Command: `kubectl get nodes -l node-pool=gpu-scoring -o wide`, showing three nodes. Then: `kubectl describe node <node-name> | grep -A3 Taints`, output showing `Taints: workload-type=gpu:NoSchedule`.

**NARRATION:**
> "First real step: I'm not guessing the taint key — I'm reading it off the actual node pool. `kubectl describe node`, and there it is: `workload-type=gpu`, effect `NoSchedule`. That's the exact key and value my toleration needs to match. If I'd assumed a generic `nvidia.com/gpu` taint because that's the common convention, I'd have gotten this wrong — this cluster's platform team tags their GPU pools differently. Checking first instead of assuming is the single habit that avoids the most common version of this mistake."

---

## Beat 4 — Confirming the device plugin is actually working (2:40–3:50)

**ON SCREEN:** Terminal. Command: `kubectl describe node <node-name> | grep -A5 Allocatable`, output showing `nvidia.com/gpu: 4`.

**NARRATION:**
> "Second check, before I even open the chart: is this node pool actually able to hand out a GPU resource? The taint tells me a pod is allowed to land here — it doesn't tell me a GPU is available once it does. `Allocatable` shows `nvidia.com/gpu: 4` — good, the device plugin is running and advertising GPUs correctly on this node. If this line were missing, no toleration or node selector I write in the chart would matter, because the resource I'm about to request in `resources.limits` wouldn't exist from the scheduler's point of view. Worth thirty seconds to confirm before writing a single line of YAML."

---

## Beat 5 — Editing the chart: toleration, selector, and resource request together (3:50–5:30)

**ON SCREEN:** Editor. `values.yaml` diff being typed live:
```yaml
nodeSelector:
  node-pool: gpu-scoring
tolerations:
  - key: workload-type
    operator: Equal
    value: gpu
    effect: NoSchedule
resources:
  limits:
    nvidia.com/gpu: 1
```

**NARRATION:**
> "Now the actual edit — and I'm adding all three pieces together, not one at a time, because they answer three different questions. The toleration says this pod is *allowed* on the tainted pool. The node selector says *put it there specifically*, not just 'allowed if it happens to land there.' And the resource limit is the actual GPU request — without it, even a pod that successfully schedules on the right node won't have a GPU attached to its container. Miss any one of these three and you get a different failure: miss the toleration, the pod never schedules; miss the selector, it might schedule somewhere with no GPU at all; miss the resource limit, it schedules fine and then fails at runtime when the model tries to load onto a device that was never allocated to it."

---

## Beat 6 — Deploying and confirming real scheduling, not just applying (5:30–6:40)

**ON SCREEN:** Terminal. `helm upgrade --install fraud-scoring-api ./chart -f values.yaml`, then `kubectl get pods -l app=fraud-scoring-api -w`, showing `Pending` briefly, then `Running`. Then `kubectl describe pod` events tail showing `Successfully assigned` and `Scheduled`.

**NARRATION:**
> "Applying it — and I'm watching the pod status, not just trusting that `helm upgrade` returning success means the deployment worked. It goes through a brief `Pending` while the scheduler places it, then `Running`. The Events in `kubectl describe pod` confirm it was actually scheduled onto the GPU pool, not just that the container started somewhere. That distinction matters because a pod can show `Running` on the wrong node type if I'd made a mistake in the selector — I want to see the specific node name and confirm it's one of the three GPU nodes I checked in Beat 3."

---

## Beat 7 — Running is not healthy: the real check (6:40–7:40)

**ON SCREEN:** Terminal. `kubectl get pods` showing `READY: 1/1`, `STATUS: Running`. Then a `curl` command against the internal service endpoint with a real payload, showing a JSON response with an actual fraud-score value.

**NARRATION:**
> "`Running`, and readiness probe passing — `1/1 Ready`. It would be easy to stop here and call this done. But that only confirms the process started and is responding to a shallow health check. The real bar is a genuine inference request. I'm sending an actual scoring request and checking that the response is a real score, not an error wrapped in a `200`, and not an empty body. That response — a real number, in the shape the API contract expects — is the actual evidence this deployment works, not the pod status above it."

---

## Beat 8 — Outro / recap (7:40–8:00)

**ON SCREEN:** Recap card, three lines appearing in sequence:
1. "Checked the node pool's real taint before writing a toleration — didn't assume a convention."
2. "Confirmed the device plugin was actually advertising GPUs before requesting one."
3. "Verified with a real inference response, not pod status alone."

**NARRATION:**
> "Three things worth taking with you: read the actual taint off the node instead of assuming a common convention, confirm the GPU resource genuinely exists before your chart asks for it, and when you're deciding whether a deployment worked, a real response beats a green pod status every time."

---

## Production notes

- This script is produced as a Remotion composition (`deploy-inference-service-video` in `/video-studio`), not a live screencast — every terminal/editor beat is a mock component, not a real recorded session. See `/video-studio/src/data/deployInferenceServiceScript.ts` for the beat-by-beat timing this renders from, and [`content/README.md`](README.md) for the render command.
- **Voiceover:** generated locally with [Chatterbox V3](https://github.com/resemble-ai/chatterbox) via `video-studio/scripts/generate-audio.ts` (`npm run generate:audio -- deployInferenceServiceScript`) — a fully offline neural TTS engine, no cloud service, no API key, no internet dependency at synthesis time (aside from the one-time model download). It's a synthetic voice, not a human recording; on-screen captions still carry the same text so the video works with sound off.
- **Why the durations look specific (14.8s, 27.1s...):** each beat's duration is the actual measured length of its generated audio clip plus a ~3s buffer, not a hand-picked round number — the same audio-driven approach `exp-inference-under-load`'s script uses. Run `generate:audio` again after editing narration text (unchanged captions are skipped via content-hash caching), read the new duration from the printed output or `deployInferenceServiceScript.manifest.json`, and update that beat's `duration` in `deployInferenceServiceScript.ts` to match.
- Generated `.wav` files live in `video-studio/public/audio/` and are gitignored (regenerate them from the script rather than committing the binaries — same treatment as the rendered `.mp4`).
- Service name "fraud-scoring-api" is fictional and deliberately *different* from the learner's own `exp-deploy-inference-service` scenario (a sentiment-analysis model) — this is what makes the video a *model of reasoning* to transfer, not a walkthrough of the learner's exact chart, per the artifact's stated purpose (see [`art-deploy-inference-service-video.yaml`](../artifacts/art-deploy-inference-service-video.yaml)).
- All terminal output and dashboard content are illustrative mockups — no real cluster, customer data, or production credentials are shown.
