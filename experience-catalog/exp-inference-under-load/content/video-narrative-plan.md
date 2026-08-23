# Video Narrative Plan — "Why Pod Autoscaling Can Still Leave You Stuck"

Informal narrative-plan document following the shape proposed in `docs/video-artifact-constitution.md` §B (`video-narrative.schema.json`), authored by hand rather than against the not-yet-built schema — per the Adoption path, steps 2-5 (schema/validator) are deferred; this is the content-only rebuild.

Written and reviewed **before** any beat in `inferenceUnderLoadScript.ts` was touched, per the constitution's "spec-first" workflow (Adoption path step 7).

## Central question

**Primary:** Why can pod autoscaling still fail when a GPU workload needs additional node capacity?

**Secondary** (must each visibly serve the primary — constitution §3):
- Why isn't CPU the right signal to scale on? *(serves: sets up why KEDA-on-queue-depth is the mechanism at all)*
- If KEDA is working and creating pods, why would anything still be broken? *(serves: this IS the central question, restated as the moment of confusion)*

## Target duration class

`standard` (2-5 min). **All ten stages are treated as REQUIRED for this build** — this is a deliberate override of the constitution document's default tiering (§2a marks Stakes/Options/Trade-offs RECOMMENDED and Takeaway OPTIONAL). This video is the reference implementation future videos will be modeled on, so it needs to demonstrate the complete spine working end-to-end, not the compressed version. Every stage below gets its own identifiable beat.

## Stage plan

| Stage | Tier (this video) | Beat(s) | What happens | Why here (not before/after) |
|---|---|---|---|---|
| **Problem** | REQUIRED | 1 beat | A concrete failing situation: a GPU inference service's users are seeing slow responses. Traffic climbed; pods are scaling; latency keeps getting worse anyway. | Constitution §1: open on a situation, not a topic name. The old cut opened on an architecture diagram — a mental-model beat wearing a Problem beat's clothes. |
| **Stakes** | REQUIRED | 1 beat, immediately after Problem | Name the consequence chain explicitly: traffic ↑ → queue grows → latency ↑ → requests start timing out → users see failures, and this is a paid-tier SLA. | Missing entirely from the current script (§C rated it only "implicit," folded into Investigation). Given its own beat so the viewer knows what's actually at risk before being asked to get curious about the mechanism. |
| **Curiosity** | REQUIRED | 1 beat | "CPU on these pods is sitting at 35%. It's not even close to maxed out. So why are we falling behind?" | §C's gap: the old cut put this content (Beat 5, "KEDA can't create GPU capacity") *after* four beats of mental model had already been given away. Moving it to position 3 (right after Stakes) means the viewer wants the architecture explanation instead of just receiving it. |
| **Context / Mental Model** | REQUIRED | 3-4 beats | The request path (Users→ALB→Service→Pod→GPU), then the three control components (KEDA, Scheduler, Karpenter) introduced as *answers being assembled*, not as a static diagram tour. | Comes after Curiosity now, reordering the old sequence. Kept compact — §2's "minimum model needed, no more." |
| **Options** | REQUIRED | 1 beat | Before settling on "queue depth + KEDA," name the alternative that's the obvious first instinct: a CPU-based HPA. State what it would do (scale on CPU%) and why that's tempting (it's the default, well-known mechanism). | §C's clearest gap: HPA was never mentioned as a rejected alternative. This is the new beat that fixes it — constitution §2b requires the technology to "emerge as the answer," which requires a real alternative to have been considered and set aside. |
| **Trade-offs** | REQUIRED | 1 beat | Structured, not a single declarative line: HPA solves replica count from CPU, doesn't reflect queue-backed demand for this workload. KEDA solves the same replica-count problem from a better signal, but doesn't touch node capacity. Karpenter solves node capacity, but doesn't decide replica count. | §C: the old cut had "KEDA can create pods but not GPU capacity" as one sentence buried inside a Curiosity-flavored beat. This gives the three-way comparison its own beat and its own visual (a compact "solves / doesn't solve" side-by-side), directly implementing constitution §2b's structural requirement. |
| **Investigation / Demonstration** | REQUIRED | 6-7 beats | The full traffic-climb → KEDA-scales → Pending-pods → Karpenter-provisions → recovery sequence. This is the strongest existing material (§C: "best-executed stage") — kept almost entirely as-is, retimed to its new position after Options/Trade-offs. | No structural change needed here; this is where the reasoning spine's evidence lives. |
| **Decision** | REQUIRED | 1 beat (new, standalone) | Explicit statement, separate from the recap: "so the decision is: KEDA owns replica count because queue depth is the honest signal for this workload; Karpenter owns node capacity because that's a different resource entirely; running both together, not one instead of the other, is what actually closes the gap." | §C's gap: the old cut had a Decision beat for the Act 5 sub-story (the rate-limit mitigation) but no equivalent Decision beat for the main KEDA+Karpenter story — it jumped straight from Investigation to Recap. |
| **Best Practice** | REQUIRED | 1 beat (new, standalone) | One crystallized, actionable sentence: "If replicas are increasing but pods remain Pending, don't tune the pod scaler harder — check node capacity and the scheduler first." | §C's gap: this rule was implied by the whole video but never stated as a standalone, memorable line. Now it gets its own beat, distinct from both Decision (why we chose this) and Takeaway (what to remember). |
| **Investigation / Demonstration (Act 5, reused)** | REQUIRED (already satisfied) | 5 beats, unchanged | The existing expert-diagnosis sequence on `doc-search-summarizer`, reframed as "now watch an experienced engineer apply this same reasoning to a live incident." | Unchanged from the current script — §C already rates this "strong fit." Its own internal Decision beat (the rate-limit mitigation) stays as the sub-story's decision, distinct from the main Decision beat above. |
| **Takeaway** | REQUIRED | 1 beat, unchanged | The existing three-line recap (KEDA/Karpenter/Scheduler, "what question does each answer"). | §C already rates this "good fit" — kept as-is; re-tagged REQUIRED for this build per the user's instruction that all ten stages must land. |

## Aha moment (constitution §2c)

Unchanged from the reference shape in the constitution's §E: KEDA successfully creates more pods; two remain Pending anyway; the reveal is that pod scaling and infrastructure scaling are different control loops, neither able to do the other's job. This lands during the Investigation stage (the existing Pending-pod beat) and gets its payoff stated explicitly in the new Decision beat, rather than only being implied by the recap as before.

## What changes vs. the current script, concretely

1. **New Problem beat** (position 2, after title) — a concrete failing situation, not an architecture tour.
2. **New Stakes beat** (position 3) — the consequence chain (traffic → queue → latency → timeouts → user-visible failure, paid-tier SLA at risk), stated explicitly rather than left implicit.
3. **Curiosity beat** (position 4) — restated as a direct question ("CPU is at 35%, so why are we falling behind?"), before any mental model is given.
4. **Mental model (existing Act 1 architecture beats) kept, but now positioned as the answer to Curiosity's question, not the video's opening move.**
5. **New Options beat** — HPA named and described as the obvious-but-insufficient first instinct.
6. **New structured Trade-offs beat** — HPA vs. KEDA vs. Karpenter, each "solves X / doesn't solve Y," replacing the old single-sentence version embedded in the mental-model beat.
7. **Existing Investigation content (traffic climb → Pending → Karpenter → recovery) kept almost verbatim**, retimed to its new position.
8. **New standalone Decision beat** — explicit "so the decision is..." statement, separate from and preceding the recap.
9. **New standalone Best Practice beat** — the "if replicas are increasing but pods stay Pending" rule, crystallized as its own line.
10. **Act 5 (expert reasoning) and the final recap kept unchanged** — both already rated well by §C.

Net beat count (including the title beat in both totals): 17 → 24. Six new beats were added (Problem, Stakes, Options, structured Trade-offs, standalone Decision, standalone Best Practice); the Curiosity stage reuses/relocates existing content (the old script's Beat 5) rather than adding a new beat, and one old architecture beat's content was split slightly differently across the four Context/Mental Model beats to keep each one focused on a single idea. Final render: 24 beats, 5:29 (329s), confirmed via `ffprobe` and frame-by-frame inspection across all ten stages.

## Post-launch fix: Investigation stage collapsed into one continuous scene

After this build shipped, direct feedback on the rendered video identified it as "boring within a minute" with three concrete, missing pieces the reference video (an external example) had and this one didn't: camera zoom/pan onto whatever's narratively relevant, live pod spawn/despawn in the cluster, and an animated queue (spike up, drain down) with a live counter. Investigating confirmed the root cause already recorded in `docs/video-artifact-constitution.md` §5: the six Investigation-stage beats (`metrics` × 3, `pending`, `karpenter` × 2) were each their own `<Sequence>`, so `useCurrentFrame()` reset at every cut and no animation could survive a beat boundary — numbers snapped instead of counting, pods swapped between static per-beat snapshots instead of spawning, and there was no mechanism for continuous camera movement at all.

The fix (implemented, not deferred this time): those six beats were replaced with one `investigation` beat type rendering `InvestigationScene.tsx` inside a single continuous `<Sequence>` spanning the same 122.3s–206.0s span exactly. A `Keyframe[]` (time → traffic/podCount/gpuPct/queueDepth/node-fill-levels/pending-and-resolved-pod-ids) is sampled and linearly interpolated every frame; a new `SqsQueueMeter` component (fill-blocks + a live-counting number) visualizes queue depth the same way; pods spawn at a fixed frame anchored to their keyframe's own time (not the live playhead, which would replay the entrance every frame); and a `CameraKeyframe[]` drives `CameraFrame` (the pure-geometry half of the existing `CameraFocus`) to pan/zoom across the scene in sync with the content keyframes. The six narration segments (same captions, same `beat11.wav`–`beat16.wav` audio files) now live as `segments` within that one beat rather than as six separate beats — see `video-script.md`'s Stage 7 section for the updated shot list. Total video duration and every other stage are unchanged.
