# Video Artifact Constitution

**Status: approved as the foundation.** This document's structure (the reasoning spine, the REQUIRED/RECOMMENDED/OPTIONAL stage classification, the narrative model, and the validation rules) is adopted. The schema and validator described in [§B](#b-proposed-schema-narrative-structure-video-specification-ir) and [§F](#f-validation-checklist-toward-automation) are the next concrete step — see [Adoption path](#adoption-path) for exactly what is and is not yet implemented. `exp-inference-under-load`'s existing rendered video has **not** been rewritten under this document; [§C](#c-mapping-onto-exp-inference-under-load) remains a diagnosis, not a completed refactor, per the explicit instruction to establish the law before touching the reference video.

This document is the canonical pedagogical and storytelling law for the **Video** artifact type across every AVENTIQLAB experience — not a description of one EKS video. It exists because the current `exp-inference-under-load` video (rewritten earlier in this repo's history from a cold-open incident diagnosis into a 6-act teaching sequence) was built by *inventing* a narrative shape ad hoc. That shape happened to be reasonable, but nothing forced the next video author to reach the same one, and nothing lets a reviewer check a script against a rule before it's animated and rendered. This document is that rule, written generically enough that the next video — on RAG, on Karpenter bin-packing, on fine-tuning, on anything — is bound by the same law without re-deriving it.

---

## 0. What exists today (inspection findings)

Before proposing anything, here is where every relevant concept currently lives, so the rest of this document can say "extend X" or "reuse Y" precisely rather than vaguely.

| Concept | Current location | Current state |
|---|---|---|
| The experience's pedagogical intent | `schemas/experience.schema.json` | Has `learner_problem`, `core_concept`, `mental_model`, `system_architecture`, `prerequisite_knowledge`, `learning_sequence`, `key_takeaways`, `misconceptions`, `evidence_of_understanding` — all optional, added in this repo's history for `exp-inference-under-load`. **No `options`, `trade_offs` (video-level), `decision`, or `best_practices` fields exist yet at the experience level** (`trade_offs` exists but is scenario-specific: `{tension, choice_a, choice_b}`, not "here are 3 named approaches and what each does/doesn't solve"). |
| The Video artifact's declared shape | `schemas/artifact-spec.schema.json`, `type: "video"` branch | Requires `format` (enum: `screencast`/`talking-head`/`animated-explainer`), `script_outline` (array of strings), `on_screen_demonstrations` (array of strings). **This is a syllabus, not a narrative contract** — it says what topics appear, never what order of *problem → curiosity → model → options → trade-offs → decision → practice → takeaway* they must appear in, and nothing validates that order. |
| The artifact-type taxonomy | `artifact-model/README.md`, `schemas/common/vocab.schema.json`'s `artifact_type` enum | Six types: Material, Video, Source Code/Lab, Battleground, Quiz, Skill Evaluator — each with a one-line purpose/anti-purpose. Video's stated purpose: "Build mental models by narrating an expert's reasoning process out loud, usually on a comparable-but-different scenario." This is compatible with the constitution below but says nothing about *how* to build that mental model. |
| The actual script (human-readable) | `experience-catalog/<exp>/content/video-script.md` | Free-form Markdown: a beat-by-beat `### Beat N — <title> (timestamp)` / `**ON SCREEN:**` / `**SUBTITLE:**` structure. This is documentation of the video, hand-written to match the data file below — **not schema-validated, not machine-checked against any narrative rule**. |
| The actual script (machine-readable) | `video-studio/src/data/<name>Script.ts` | A hand-authored `Beat[]` TypeScript array. Each beat has a `type` (`'title' \| 'architecture' \| 'metrics' \| 'pending' \| 'karpenter' \| 'dashboard' \| 'terminal' \| 'recap'`), `start`/`duration` (seconds, derived from real synthesized audio length), a `caption` (the exact narration text), and type-specific visual props (node positions, metric values, terminal lines, etc.). **This is the closest thing to a "Video Specification / IR" that exists today** — but its `type` values are visual/rendering concerns (which mock component to show), not narrative/pedagogical stages (which act of the constitution this beat belongs to). There is no field anywhere that says "this beat is the CURIOSITY beat" or "this beat is the TRADE-OFFS beat." |
| The renderer | `video-studio/src/compositions/<Name>.tsx` | A `Sequence`-per-beat React/Remotion component that pattern-matches on `beat.type` and renders the matching mock component (`ArchitectureDiagram`, `MetricsRow`, `PendingPodsScene`, `KarpenterScene`, `DashboardMock`, `TerminalMock`, `RecapCard`) plus a shared `CaptionBar`. Generic in the sense that it's driven by data, not hardcoded per-experience content — but every `beat.type` is a rendering concern, and the renderer has zero awareness of narrative structure. It would happily render 17 CURIOSITY beats in a row with no PROBLEM beat; nothing stops that. |
| Visual components (reusable) | `video-studio/src/components/*.tsx` | `ArchitectureNode`/`ArchitectureDiagram`/`FlowArrow` (system topology), `MetricsRow`/`CapacityMeter` (live numeric state), `PendingPod`/`PendingPodsScene` (unsatisfied-demand state), `KarpenterScene` (capacity-arrives/recovery state), `DashboardMock`/`TerminalMock`/`EditorMock` (screencast-style investigation), `RecapCard` (summary), `CaptionBar` (subtitles), `CameraFocus` (zoom/emphasis), `TitleCard`, `theme.ts`. This is a real, reusable visual grammar — see [§5](#5-visual-grammar-mapping-to-existing-components) for how it maps onto the constitution's required visual states. |
| Subtitles | `video-studio/src/components/CaptionBar.tsx` | Already fixed to render **only** the caption text, centered, no label — a prior bug rendered a literal `"NARRATION"` heading above every line. This already matches the constitution's Subtitle Rule ([§7](#7-subtitle-rule)); nothing further needed here beyond keeping new beats' `caption` fields to plain spoken text (never `"CAPTION: ..."` or beat/act names baked into the string). |
| Audio | `video-studio/scripts/generate-audio.ts`, `src/audio/{TTSProvider,cache,config}.ts`, `src/audio/providers/ChatterboxProvider.ts` | Chatterbox V3 (local, offline neural TTS) behind a generic `TTSProvider` interface; a beat's `caption` is synthesized 1:1 into one `.wav` per beat, with content-hash caching. Beat `duration` is then hand-updated to match the real synthesized length + a buffer. This already means **narration timing is derived from real speech, not guessed** — a precondition for the Audio Rule's "synchronized around reasoning, not timestamps" ([§8](#8-audio-rule)), though nothing currently enforces *pauses before reveals* or *pacing that matches a reasoning beat* specifically. |
| Validation | `docs/validation-guide.md` | JSON-Schema validation (`check-jsonschema` / the repo's Python venv fallback) plus a hand-walked cross-reference table (id-uniqueness, `*_ref` resolution). **No content-quality or narrative-structure validation exists for any artifact type**, video included — schema validation checks shape, never sequence or pedagogical completeness. |
| The larger pipeline this fits into | `docs/future-architecture-notes.md` | `Learner Context → Capability Model → Experience → Learning IR → Artifact JSON → Content Artifact`. Phase 0 builds only the first three stages by hand. **"Learning IR" and "Artifact JSON" are already-named, not-yet-built stages** — this document's proposed "Video Specification / IR" ([§6](#6-pipeline-and-separation-of-concerns)) is not a new concept bolted onto the architecture; it is the video-flavored instance of the "Artifact JSON" stage the architecture notes already reserved. |

**The core gap, stated plainly:** the repo has content-model fields for *what a video should teach* (experience-level `core_concept`/`mental_model`/etc.) and a data structure for *what a video visually does* (`Beat[]`), but nothing in between that says *in what narrative order the teaching has to unfold*, and nothing that checks a script against that order before it's animated. This constitution is that missing middle layer.

---

## A. The Video Artifact Constitution

### 1. Core philosophy

An AVENTIQLAB technical video is a worked engineering reasoning process, not a narrated reference document. The test for every video: **could a viewer with the sound off still follow the shape of the reasoning from the visuals alone** (problem → tension → model → choice → resolution), **and could a viewer with the video off still follow the same reasoning from the transcript alone?** If either answer is no, the video has failed regardless of production quality.

A video fails this test if it could be described as any of:
- documentation read aloud
- a list of definitions
- a product tutorial
- a sequence of YAML/code snippets with narration bolted on
- an animation built first, with narration written to fit it afterward

It succeeds if the viewer's internal monologue runs: *something is happening → why is this happening? → what could we do? → what are the alternatives? → why would an experienced engineer choose one? → ah, now I understand.*

This is a storytelling **philosophy**, not a creator identity. No specific creator's wording, visual style, pacing signature, or personality is referenced or imitated anywhere in this document or in any video built from it — only the general explanatory-documentary structure (real problem → curiosity → progressive reveal → comparison → demonstration → decision → principle) is adopted, which is a structure common to explanatory nonfiction broadly, not any one author's property.

### 2. The canonical reasoning spine — not a checklist

Every substantial technical video's *reasoning* moves through the same underlying arc. Stating it as ten named stages makes it teachable and reviewable, but **the ten names are a description of a journey the learner takes, not ten boxes a script must tick.** A script that mechanically inserts one beat per stage — dutifully, joylessly, in order — has satisfied the letter of this document while failing its entire purpose. The stages exist to be reasoned about, not counted.

Concretely, this means:

- **Stages may combine.** A short video's Problem beat and Curiosity beat are often one and the same breath ("traffic doubled, but CPU is still only 35% — so why is Kubernetes not adding capacity?" is Problem and Curiosity in one sentence, not two beats).
- **Stages may be skipped**, deliberately and namelessly-obvious-in-context, without a `skip_reason` essay — a 45-second video does not owe the constitution a paragraph explaining why it has no standalone Trade-offs beat; the compression is self-evident from the runtime.
- **Weight is not distributed evenly.** The stage carrying the actual engineering judgment — Problem through Decision — should usually get the most narrative and visual time. Best Practice and Takeaway are often one crisp beat each; they should never be allowed to balloon just to feel "complete."
- **Order is the one thing that does not bend.** Curiosity is never manufactured after the mental model has already been given away; a Decision is never stated before the options it's deciding between have been shown. The arc's *sequence* is load-bearing even when its *segmentation* is fluid.

The **final test is never** "did the video contain all ten stages." The final test is:

> Did the learner experience a compelling engineering problem, develop genuine curiosity, understand the relevant mental model, see the real possible solutions, understand what each one trades away, watch the system actually behave, understand why the decision was made, and leave with one engineering principle they can apply somewhere else?

If that experience happened, the video has succeeded even if three of the ten named stages never appeared as distinct beats. If that experience did not happen, ten dutifully-labeled beats have not saved it.

| # | Stage | One-line test | Requirement tier (§2a) |
|---|---|---|---|
| 1 | **Problem** | Does the video open on a concrete situation, not a topic name? | REQUIRED |
| 2 | **Stakes** | Does the viewer know what breaks if this isn't solved? | RECOMMENDED |
| 3 | **Curiosity** | Is there a specific, answerable question the viewer now wants resolved? | REQUIRED |
| 4 | **Context / Mental Model** | Does the viewer get the minimum system model needed to understand the question — no more? | REQUIRED |
| 5 | **Options** | Are 2+ real, named approaches presented before any is favored? | RECOMMENDED |
| 6 | **Trade-offs** | For each option, is what it solves AND what it doesn't solve stated? | RECOMMENDED |
| 7 | **Investigation / Demonstration** | Is cause-and-effect shown changing on screen, not just described? | REQUIRED |
| 8 | **Decision** | Is the reasoning for the chosen approach stated, not just the choice? | REQUIRED |
| 9 | **Best Practice** | Is there a specific, actionable rule the viewer can carry into their own work? | REQUIRED |
| 10 | **Takeaway** | Does the video close by naming 3–5 things the viewer can now explain, tied back to stage 1? | OPTIONAL |

Full statements of each stage's rules, examples, and anti-examples are in the brief that produced this document and are incorporated by reference into this constitution; the table above is the checkable summary every script is written and reviewed against. The requirement tier column is defined precisely in [§2a](#2a-required-vs-recommended-vs-optional).

### 2a. Required vs. Recommended vs. Optional

Three tiers, used consistently by the schema ([§B](#b-proposed-schema-narrative-structure-video-specification-ir)) and the validator ([§F](#f-validation-checklist-toward-automation)):

- **REQUIRED** — Problem, Curiosity, Context/Mental Model, Investigation/Demonstration, Decision, Best Practice. A video missing any of these has not delivered the constitution's core promise (a worked engineering reasoning process, ending in an applicable rule) no matter how good its production values are. The narrative-spec validator rejects a spec that marks any REQUIRED stage `skipped: true`.
- **RECOMMENDED** — Stakes, Options, Trade-offs. These are what separates a video that teaches engineering *judgment* from one that only teaches a *conclusion*. Skipping them is legitimate — a video whose problem has only one sane response may have nothing real to compare — but skipping them is a decision the author must name (`skip_reason`), and a reviewer should ask whether the skip is genuine or lazy. The validator warns, but does not reject, a spec that skips a RECOMMENDED stage.
- **OPTIONAL** — Takeaway. A closing recap is good practice and the reference video already does it well, but it is genuinely dispensable for a short video where the Best Practice line already *is* the takeaway. The validator neither requires nor warns on this stage's absence.

This tiering is what makes §2's "not a checklist" instruction enforceable rather than just aspirational prose: a validator that required all ten would be exactly the mechanical checklist this document forbids; a validator that required none would validate nothing. Three tiers is the smallest structure that lets automation hold the line on what actually matters (engineering judgment: Problem→Decision→Best Practice) while staying silent on genuine, author-judged compression.

### 2b. Engineering judgment is the core — technology emerges as the answer

The strongest, most heavily-weighted part of any AVENTIQLAB video is the chain **Problem → Possible explanations → Possible solutions → Trade-offs → Evidence → Decision.** This is deliberately also the chain that maps onto the REQUIRED tier plus the RECOMMENDED Options/Trade-offs stages — the constitution's weighting and its content priority are the same thing stated twice.

The concrete authoring rule this implies: **never introduce a technology by definition.** Do not write "KEDA is a Kubernetes event-driven autoscaler." Instead, let the technology arrive as the answer to a question the viewer has already been made to ask:

> "Traffic is increasing, but CPU doesn't reflect the real workload. What signal actually represents demand?" *(curiosity)* → introduce queue depth as that signal *(context)* → "so what are our options for reacting to it?" *(options: HPA, KEDA, Karpenter)* → compare what each one actually controls *(trade-offs)* → show it happening *(investigation)* → "for this workload, queue depth is the better signal, so KEDA owns replica count" *(decision)*.

The name of the tool is the *answer*; it is never the *topic sentence*. A script that can be summarized as "this video explains what KEDA is" has already failed §2b even if every other stage is present.

### 2c. Every substantial video needs an "aha" moment

At least one point in every substantial (standard or deep-dive) video should be a genuine conceptual reveal — a moment where a fact that looked like a contradiction resolves into an insight the viewer will remember without having memorized any wording. The reveal is not an isolated beat; it is what stages 3 (Curiosity) and 7 (Investigation/Demonstration) are *for* — Curiosity plants the open question, Investigation earns the answer.

Reference shape (see [§E](#e-reference-narrative-the-eks-example) for the full worked example): KEDA successfully creates more pods. Some remain Pending anyway. The viewer's own question — "why?" — gets answered by the reveal that scaling the application and scaling the infrastructure are two different control loops, neither of which can do the other's job. That sentence is the payoff the entire visual and narration build toward; everything before it exists to make the viewer want it, and everything after it (Decision, Best Practice) exists to make it actionable.

A video with no identifiable aha moment has probably drifted into stating facts in order rather than building an argument — this is one of the fastest tells that a script has become a checklist (§2) rather than a reasoning spine.

### 3. One video, one primary engineering question

Every substantial video is organized around exactly one primary engineering question (the Curiosity stage's question, made explicit). Everything else in the video exists to serve that question.

| | |
|---|---|
| BAD | "Kubernetes autoscaling explained." |
| GOOD | "Why can pod autoscaling still fail when a GPU workload needs additional node capacity?" |

The BAD framing names a *topic*; the GOOD framing names a *question with a specific, non-obvious answer*. A viewer can't get curious about a topic — only about a question. This is the same test as §2b's "technology emerges as the answer" applied one level up: the video's own title-in-spirit should be a question, not a syllabus entry.

Secondary questions are allowed only when they visibly serve the primary one (e.g. "why isn't CPU the right signal?" serves "why did pod scaling fail?"). A video that tries to fully answer two *unrelated* questions ("why pod scaling isn't enough" *and*, unrelated, "how does bin-packing work") should be split into two videos, or the unrelated question demoted to a single Best Practice line. This is what keeps the reasoning spine traceable — a viewer following two independent questions at once cannot tell which one the current beat is serving.

### 3a. The minimum recognizable signature

Whatever a video compresses down to under time pressure, four beats define the smallest shape that is still recognizably an AVENTIQLAB technical video rather than a definition dump:

```
Problem → Curiosity → Explanation/Options → Best Practice
```

This is the practical floor beneath [§2a](#2a-required-vs-recommended-vs-optional)'s REQUIRED tier — even a 30-second short that skips Stakes, Options-as-a-separate-beat, Trade-offs, a standalone Decision beat, and the closing Takeaway must still recognizably open on a real situation, pose a real question, resolve it, and leave the viewer with something to do differently. A video that cannot be compressed to at least these four beats without becoming incoherent has a structural problem no amount of visual polish will fix.

### 4. Code and configuration discipline

YAML, CLI output, and config diffs may appear **only** inside the Investigation/Demonstration stage (stage 7) or, briefly, inside Decision (stage 8) to show the exact fix — never as a substitute for stages 1–6. A video that shows a `ScaledObject` manifest before establishing why the viewer should care what it does has violated this rule regardless of how well-formatted the manifest is. The existing `exp-inference-under-load` script already follows this — its Act 5 terminal beats (`kubectl get scaledobject`, the rate-limit YAML edit) appear only after the architecture and failure have been established — and that placement should be treated as the pattern, not a coincidence.

### 5. Visual grammar (mapping to existing components)

The constitution requires seven consistent visual states, used identically across every video regardless of topic. These are not new components — the existing `video-studio` component set already implements six of the seven; the mapping below is the missing documentation that makes the pattern explicit and reusable rather than accidental.

| Constitution state | Meaning | Existing component(s) that already implement it | Gap |
|---|---|---|---|
| **Normal / Healthy** | Calm baseline | `ArchitectureDiagram` + `MetricsRow` with no highlight, values in `theme.text`/`theme.textDim` | None — already the default rendering state. |
| **Warning** | Degrading | `MetricsRow`'s `color: 'warning'` metric tiles (amber) | None. |
| **Failure** | Cannot satisfy demand | `MetricsRow`'s `color: 'danger'` tiles, `CapacityMeter`'s `full`/red-fill state | None. |
| **Highlight** | Component being explained now | `ArchitectureNode`'s `highlighted` prop (accent border + glow) and `dimmed` prop (everything else fades) | None. |
| **Flow** | Cause/effect relationship, traffic/data movement | `FlowArrow`'s `flowing` prop (traveling dot) and `highlighted` prop | None. |
| **Pending** | Wants something, can't get it yet | `PendingPod` (dashed amber outline, pulsing), `PendingPodsScene` | None. |
| **Recovery** | The decision worked | `KarpenterScene`'s fade-in "joining" capacity meter + green "Scheduled — Running" pod state | None. |

No new visual component is required to satisfy the constitution's visual grammar for a video shaped like `exp-inference-under-load`'s. A genuinely different topic (e.g. a RAG-retrieval video with no "nodes/pods" concept) will need topic-specific components, but every such component should still be classifiable as one of these seven states — that classification, not the component's specific look, is what must stay consistent across videos. A future component library README should state this mapping explicitly (see step 3 of [Adoption path](#adoption-path)).

The rule "every major animation must answer *what changed / why did it change / what caused it / what consequence did it result in*" is a review-time check (see gate 16 in [§F](#f-validation-checklist-toward-automation)), not a schema-enforceable one — no field can prove an animation answers a question, only a human (or eventually ASTRA) reviewing the rendered beat can.

**Generic primitives, never topic-specific semantics baked in.** `ArchitectureNode`, `FlowArrow`, `MetricsRow`, `CapacityMeter`, `PendingPod` and the rest take their meaning entirely from the props a script passes them (a `kind`, a `label`, a `highlighted` boolean, a `fillPercent` number) — none of them contain the string `"KEDA"`, `"Karpenter"`, `"GPU"`, or any other EKS-specific concept in their own source. A future RAG video's "chunking is falling behind embedding throughput" beat should reuse `CapacityMeter` and `PendingPod` for its own queue/backlog visualization rather than a new component being invented, precisely because those components already only know about the seven generic states above, never about GPUs specifically. If a future component needs a state this table doesn't cover, extend the table (an eighth state, defined generically) before writing a component that's secretly topic-specific under a generic-sounding name.

**Numbers that change must animate through the change, not cut to it.** `MetricsRow`, `CapacityMeter`, `SqsQueueMeter`, and any future component displaying a quantity that the narration describes as rising, falling, or scaling *must* visually count/tween through that change while it's being narrated. Concretely, if a caption says "traffic climbs from 100 to 600 requests a second," the on-screen number should be seen incrementing across that range during the beat, not fade in already reading "600" — a value that appears fully-formed reads as a slide, not as a system responding in real time; **[Investigation/Demonstration](#2-the-canonical-reasoning-spine-not-a-checklist)'s entire job is to show cause-and-effect changing on screen, which a static number cannot do.**

**Fixed** (`exp-inference-under-load`'s Investigation stage, `video-studio/src/components/InvestigationScene.tsx`). The two compounding defects originally recorded here — (1) `MetricsRow` taking pre-formatted display strings with no numeric interpolation, and (2) six separate per-moment `<Sequence>`s each resetting `useCurrentFrame()` to 0, so no tween could survive a beat cut — are both resolved by the same restructuring:

1. `MetricsRow` now takes numeric `value`s (plus an optional `format` function for units), so any caller can tween a number through a range; the six old `metrics`/`pending`/`karpenter` beats collapsed into one `investigation` beat type carrying a `Keyframe[]` — `{ t, traffic, podCount, gpuPct, queueDepth, nodes, pendingPods, resolvedPods }` sampled and linearly interpolated every frame.
2. All six moments now render inside **one continuous `<Sequence>`** (`InferenceUnderLoad.tsx`'s `investigation` branch), so `useCurrentFrame()` never resets mid-story — a shared `sampleAt()` finds the two bracketing keyframes for the current frame and interpolates between them, meaning traffic/pods/GPU%/queue-depth genuinely count up and down as the story plays rather than snapping at cuts. Discrete (non-numeric) state — which pods are Pending vs. Scheduled — snaps at its keyframe's own boundary rather than interpolating, since there's no continuous "half pending" state, but the *visible* pod entrance/exit still animates (see below) even though the underlying set change is instantaneous.

Two related patterns landed alongside the fix, worth stating as their own sub-rules since they generalize beyond this one video:

- **Camera choreography must be timed to content, not offset from it.** A `CameraKeyframe[]` (`{ t, focalX, focalY, scale }`, sampled and interpolated the same way as content keyframes) drives a shared-origin `CameraFrame` (the pure-geometry half of `CameraFocus`, with no internal spring/timing of its own) that pans/zooms across the whole continuous scene. The keyframe times must match the content keyframe times a region becomes relevant, not arrive late — and because `CameraFrame` scales the *entire* scene from one transform origin, every element that must stay readable at a given moment has to sit close enough to that moment's focal point to survive the zoom; a layout that spreads relevant content across the full canvas height will clip itself at any real push-in.
- **An entity appearing/disappearing (a pod spawning, a node joining) needs its own fixed appear-frame anchored to scene time, not to the live playhead.** Deriving an entrance frame from `useCurrentFrame()` directly replays the entrance animation every frame after the true spawn moment; the fix is to compute the spawn frame once from the keyframe's own `t` (e.g. `boundaryFrame = round(kf.t * fps)`) and pass that fixed frame down as a prop.

### 6. Pipeline and separation of concerns

This constitution slots into the architecture already named in `docs/future-architecture-notes.md`, without renaming or restructuring that architecture:

```
Learner Context → Capability Model → Experience → Learning IR → Artifact JSON        → Content Artifact
                                         │                          │                       │
                              (has core_concept,        (this is where a video's       (the rendered
                          mental_model, key_takeaways,   Narrative Spec belongs -      .mp4, produced
                        etc. - the PEDAGOGICAL CONTENT)   the VIDEO SPECIFICATION /     by video-studio,
                                                              IR this doc proposes)     the RENDERER)
```

Five layers, kept strictly separate:

1. **Pedagogical rules** (this document) — generic, topic-agnostic, versioned independently of any experience. Never contains the word "KEDA" or "Karpenter."
2. **Content** (`experience.yaml`'s pedagogical fields — `learner_problem`, `core_concept`, `mental_model`, etc., extended per [§9](#9-recommended-minimum-schema-extension)) — topic-specific facts and framing, authored by a human, validated for shape but not for narrative order.
3. **Video Specification / IR** (a new, small, per-video structure — [§B](#b-proposed-schema-narrative-structure-video-specification-ir)) — maps stage 1–10 onto this specific video's beats. This is new; nothing in the repo currently occupies this layer for video specifically.
4. **Renderer** (`video-studio`'s compositions + components) — stays exactly as generic as it is today. The renderer should never need to know what stage a beat belongs to to render it correctly; it only needs `beat.type` (a rendering concern) as it does now. Stage-tagging is a script-authoring and validation concern, not a rendering one.
5. **Audio generation** (Chatterbox V3 pipeline) — stays exactly as-is; already correctly isolated behind the `TTSProvider` interface and already produces duration-accurate timing.

The **Content Artifact** (final rendered `.mp4`) is the output of layers 3+4+5 together and is not itself part of the constitution — the constitution governs what goes into producing it, not the binary file.

### 7. Subtitle rule

Already implemented correctly (see [§0](#0-what-exists-today-inspection-findings) table) and restated here as binding law rather than incidental behavior: a rendered subtitle contains **only** the spoken transcript text. Never a speaker label, never `"NARRATION"`/`"CAPTION"`, never a beat name, act name, internal id, or any other authoring/system metadata. `CaptionBar.tsx`'s current implementation (post-fix) is the reference implementation; any new caption-rendering component must match it.

### 8. Audio rule

Narration text (the `caption` field on every beat) must read like one engineer explaining a problem to another — not textbook prose. Concretely, a caption should be checkable against:
- Does it ever pose a genuine question (not rhetorical filler) at a Curiosity-stage beat?
- Does it state a cause before its effect, not the reverse, at Investigation-stage beats?
- Does it name what an option does NOT do, not only what it does, at Trade-offs-stage beats?
- Does it explain the reasoning for a choice, not just announce the choice, at Decision-stage beats?

Avoid definitional phrasing — "X is defined as," "X refers to," "X is a type of Y" — anywhere in a caption; this is the sentence-level symptom of the tool-first authoring §2b forbids at the structural level. Prefer transition phrases that carry the *shape* of reasoning, not just its content:

> "Here's the interesting part…" · "But there's a problem…" · "At first, you might think…" · "That sounds reasonable, but…" · "Now we have to ask…" · "This is where the second [scaling/retrieval/caching/…] layer matters…"

These are illustrative connective tissue, not a mandatory phrase list — a caption that never once sounds like it's mid-thought, and instead reads as a sequence of complete, self-contained factual sentences, has drifted back into documentation-voice regardless of how conversational any single sentence looks in isolation.

Because beat duration is already derived from real Chatterbox-synthesized audio length (not guessed), "pauses before important reveals" are achievable today by simply giving a reveal-beat its own short beat rather than burying the reveal mid-paragraph in a longer one — this is an authoring discipline, not a pipeline change.

### 9. Recommended minimum schema extension

Per the brief's instruction to recommend the *smallest clean extension*, not to implement one yet — and per the brief's explicit warning against adding fields "merely because they sound useful," each field below is justified by exactly which stage(s) in [§2](#2-the-canonical-reasoning-spine-not-a-checklist)/[§2a](#2a-required-vs-recommended-vs-optional) it represents and why no existing field already covers it:

**At the experience level** (`schemas/experience.schema.json`), three fields are missing — the existing fields already cover every other stage (see the table in [§0](#0-what-exists-today-inspection-findings)):

- `options` — array of `{name, what_it_solves, what_it_does_not_solve}`. Represents the RECOMMENDED Options/Trade-offs stages. Distinct from the existing scenario-specific `expected_decisions[].options_considered` (which is a decision-point's plausible-vs-correct list for one specific mission moment) — `options` is the video/teaching-level "here are the named approaches in this space," independent of any one decision point.
- `decision` — string or small object `{chosen, reasoning}`. Represents the REQUIRED Decision stage at the experience level. Distinct from `expected_decisions[].sound_reasoning`, which is scenario-specific reasoning for one specific mission's correct answer.
- `best_practices` — array of strings, each an actionable rule (e.g. "If pods are scaling but remain Pending, investigate node capacity before tuning the scaler"). Represents the REQUIRED Best Practice stage. Distinct from `key_takeaways` (statements the learner can *make*) — best practices are rules the learner can *apply*.

All three would be **optional** at the schema level (not to be confused with the OPTIONAL *stage tier* — an experience without a `best_practices` field simply hasn't been extended yet; a video whose narrative spec marks Best Practice `stage_present: false` has failed a REQUIRED-tier check), following the precedent already set by `learner_problem`/`core_concept`/etc. — additive, `additionalProperties: false`-compatible, zero impact on the other 18 experiences.

**At the artifact-spec level** (`schemas/artifact-spec.schema.json`, `type: "video"` branch), the existing `script_outline: string[]` is too weak to express stage order — it is an unordered bag of topic strings today. The smallest clean fix is not a new field but a **stricter shape for the existing field**: change `script_outline` from `string[]` to an array of `{stage, summary}` where `stage` is drawn from the same ten-value stage enum used in [§B](#b-proposed-schema-narrative-structure-video-specification-ir)'s `video-narrative` schema — an experience with a short video may legitimately list only four or five of the ten. This is a breaking change to that one field's shape (not additive), so it should be scoped to a deliberate migration, not folded silently into an unrelated change — see [Adoption path](#adoption-path).

No change is proposed to `vocab.schema.json`'s `artifact_type` enum or to any other artifact type's schema branch. No change is proposed to the renderer or to any `.tsx` component. This restraint is deliberate, not incidental: every field proposed above maps to exactly one REQUIRED or RECOMMENDED stage this document already named as load-bearing — nothing is proposed because it "sounds useful."

---

## B. Proposed schema: narrative structure (Video Specification / IR)

This is new — it does not exist anywhere in the repo today. It is the machine-checkable bridge between an experience's pedagogical content (layer 2) and a beat data file (layer 3/4 boundary). Proposed as a new schema file, `schemas/video-narrative.schema.json`, validating a new per-video YAML/JSON sidecar (not the `Beat[]` TypeScript file itself, which stays a `video-studio`-internal rendering concern).

```jsonc
{
  "$id": "video-narrative.schema.json",
  "title": "Video Narrative Specification",
  "description": "The stage-by-stage narrative plan for one Video artifact instance, validated independently of and prior to the beat-level Beat[] data file that actually drives rendering. This is the 'Video Specification / IR' layer between an experience's pedagogical content and video-studio's renderer. Deliberately does NOT require all ten stages to be listed (see §2/§2a) - the schema's only structural requirement is that whichever stages ARE present appear in canonical order; which stages are present at all is a judgment call the validator (§F), not the schema, holds accountable against the REQUIRED tier.",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "artifact_ref", "central_question", "target_duration_class", "stages"],
  "properties": {
    "id": { "type": "string", "pattern": "^vn-[a-z0-9]+(-[a-z0-9]+)*$" },
    "artifact_ref": { "$ref": "./common/vocab.schema.json#/$defs/art_id" },
    "central_question": {
      "type": "string",
      "description": "The single PRIMARY engineering question this video exists to answer (§3), phrased as a question, not a topic - e.g. 'why can pod autoscaling still fail when a GPU workload needs additional node capacity?', never 'Kubernetes autoscaling explained.'"
    },
    "secondary_questions": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional. Any secondary questions the video also raises (§3) - each must visibly serve central_question. Not cross-reference-validated automatically (whether a secondary question 'serves' the primary one is a judgment gate, §E item 9-adjacent), but recording them here lets a reviewer check that claim directly against the stages below."
    },
    "target_duration_class": {
      "type": "string",
      "enum": ["short", "standard", "deep-dive"],
      "description": "short: 30-60s, may legitimately list only the §3a minimum signature (problem, curiosity, investigation_demonstration or context_mental_model, best_practice) in stages[]. standard: 2-5min, all REQUIRED stages plus whichever RECOMMENDED/OPTIONAL stages the author judges earn their place. deep-dive: 10min+, may repeat the chain at sub-problem level via sub_narratives (§D) - not fully designed here."
    },
    "stages": {
      "type": "array",
      "minItems": 1,
      "description": "List ONLY the stages this video actually has as distinct, identifiable narrative beats. Do not list a stage merely to mark it skipped - omission IS the record of a compressed/absent stage. The validator (§F) checks that every REQUIRED-tier stage (§2a) appears in this array for target_duration_class 'standard' and 'deep-dive'; for 'short', only the §3a minimum signature is required.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["stage", "beat_refs", "summary"],
        "properties": {
          "stage": {
            "type": "string",
            "enum": [
              "problem", "stakes", "curiosity", "context_mental_model",
              "options", "trade_offs", "investigation_demonstration",
              "decision", "best_practice", "takeaway"
            ]
          },
          "beat_refs": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "description": "Which beat(s) in the corresponding Beat[] data file realize this stage - e.g. ['beat2', 'beat3']. A single beat may combine two adjacent stages (§2's 'stages may combine') - in that case the same beat id appears in beat_refs for both stage entries. Cross-checked against the actual data file by the validator in §F, not just declared here."
          },
          "summary": {
            "type": "string",
            "description": "One sentence: what this stage accomplishes IN THIS video specifically, not a restatement of the stage's generic definition."
          }
        }
      }
    },
    "options_covered": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Cross-reference to experience.yaml's options[].name (§9) - which named options this video's Options/Trade-offs stages actually cover, so a reviewer can spot a video that covers fewer options than the experience claims exist. Only meaningful if an 'options' stage is present."
    }
  }
}
```

Note what changed from a purely mechanical first draft of this schema: the earlier version required every one of the ten stages to appear in `stages[]`, with a `skipped: true` + `skip_reason` pair standing in for an absent one. That shape was itself a checklist in disguise — it forced an author to file paperwork explaining a compression that should often be self-evident from `target_duration_class` alone. The schema above instead makes **omission the record**: a short video's `stages[]` simply doesn't mention `trade_offs`, and that absence is legible on its own once a reader knows §2a's tiers, with no `skip_reason` essay required. The validator, not the schema, is where the REQUIRED tier is actually enforced (§F) — this keeps the schema itself permissive and the judgment where it belongs.

Deliberately **not** proposed: folding this structure directly into the `Beat[]` TypeScript file. Keeping it a separate, small, schema-validated sidecar means (a) it can be authored and reviewed *before* any beat is written or animated, matching the instruction to establish the law before touching the reference video as a permanent authoring workflow, not just a one-time instruction for this task, and (b) `video-studio` never needs to import or parse it — the renderer's independence from pedagogical concerns (§6) stays real, not just stated.

---

## C. Mapping onto `exp-inference-under-load`

The current 6-act, 17-beat video already maps cleanly onto the ten-stage chain — this is a retroactive audit, not a rewrite. This confirms the constitution describes a real, achievable shape rather than an idealized one the existing video fails.

| Stage | Beat(s) | Existing caption (verbatim) | Fit |
|---|---|---|---|
| Problem | *(missing — see gap below)* | — | **Gap.** The video opens on Beat 2's architecture walkthrough, not a concrete failing situation. |
| Stakes | *(implicit in Act 3, beats 8-9)* | "GPU utilization, queue depth, and latency are all rising together" | **Partial.** Stakes are shown but folded into what the chain calls the Investigation stage rather than stated up front. |
| Curiosity | Beat 5 | "KEDA can create more pods, but it cannot create GPU capacity" | **Good fit**, though it arrives after the mental model (Beats 2-4) rather than before it — the constitution's stage 3 is supposed to precede stage 4. |
| Context / Mental Model | Beats 2-5 | Full architecture walkthrough | **Good fit**, well-executed, but ordered before Curiosity rather than after (see above). |
| Options | *(missing)* | — | **Gap.** HPA (CPU-based) is never mentioned as a rejected alternative to KEDA; the video goes straight to "KEDA is the mechanism" without ever presenting it as a chosen option among named alternatives. |
| Trade-offs | Beat 5 only | "KEDA can create more pods, but it cannot create GPU capacity... Karpenter comes in" | **Partial.** The KEDA/Karpenter division of responsibility is stated, but as a single declarative line, not as a structured "here's what each does and doesn't solve" comparison. |
| Investigation / Demonstration | Beats 6-11 (Acts 2-4) + Beats 12-16 (Act 5) | Full traffic-climb, Pending-pod, Karpenter-join sequence, then the reused expert-diagnosis dashboard/terminal beats | **Strong fit** — this is the video's best-executed stage. |
| Decision | Beat 16 | "What I can do immediately is reduce demand — a rate limit that cuts free-tier volume by 40%" | **Good fit** for the Act 5 sub-story; no equivalent Decision beat exists for the Act 1-4 architecture story (there is no explicit "and that's why we use KEDA + Karpenter together" moment separate from the recap). |
| Best Practice | *(folded into Takeaway)* | — | **Gap.** No standalone actionable rule like "if pods scale but remain Pending, check node capacity before tuning the scaler" is stated as a rule — it's implied by the whole video but never crystallized into one memorable sentence. |
| Takeaway | Beat 17 | "KEDA asks how many replicas we need. Karpenter asks whether we have the capacity. The scheduler decides where they go." | **Good fit.** |

**Net finding:** the existing video is strong on Context/Mental-Model and Investigation/Demonstration (its two longest, best-built stages) and weak-to-missing on Problem, Options, and Best Practice. This is a diagnosis, not an action item — per the brief, no rewrite is being done as part of this document.

---

## D. Short vs. long video compression (non-binding elaboration)

Restating the brief's own compression table as part of the canonical record, since it is load-bearing for how `target_duration_class` (§B) governs which stages [§F](#f-validation-checklist-toward-automation)'s validator expects to find listed:

- **Short (30–60s):** Problem → Curiosity → (Context/Model or Investigation, whichever demonstrates the answer faster) → Best Practice — the §3a minimum signature, nothing more required. Stakes/Options/Trade-offs/Decision/Takeaway are typically folded as a clause inside another stage's beat rather than given their own beat, and are simply **absent** from `stages[]` — no schema field records the omission, because at this length the omission needs no explaining (§2, §B's note on the discarded `skipped` mechanism).
- **Standard (2–5min):** All REQUIRED-tier stages present as distinct beats or beat groups, plus whichever RECOMMENDED stages the specific engineering question actually has material for — this is `exp-inference-under-load`'s current shape (see [§C](#c-mapping-onto-exp-inference-under-load) for where it presently falls short of even this).
- **Deep-dive (10min+):** The reasoning spine may repeat at the level of sub-problems (global problem → concept → sub-problem 1 → investigation → decision → sub-problem 2 → investigation → decision → final architecture). In the schema (§B), this would be represented as multiple `stages` arrays sharing one `video-narrative` document via a `sub_narratives` extension — not designed in detail here since no deep-dive video exists yet to validate the shape against.

---

## E. Reference narrative: the EKS example

This is the worked example the constitution is checked against, kept here verbatim as the canonical illustration of stage-by-stage reasoning (distinct from [§C](#c-mapping-onto-exp-inference-under-load), which audits the *actual rendered* video against this same chain — §E is the ideal shape, §C is the gap-analysis of the real artifact against it).

| Stage | Content |
|---|---|
| Problem | "GPU inference workload is experiencing increasing latency." |
| Curiosity | "CPU isn't necessarily saturated. Why is the workload still struggling?" |
| Context / Mental Model | Traffic → KEDA → Pods → Scheduler → Nodes → GPU |
| Options | HPA · KEDA · Karpenter |
| Trade-offs | Each mechanism solves a different layer of the scaling problem — none substitutes for another. |
| Investigation | Traffic increases → KEDA increases replicas → some pods become Pending → the scheduler cannot place them → Karpenter provisions additional GPU capacity. |
| Decision | Use event/queue-driven pod scaling together with infrastructure capacity provisioning — neither alone is sufficient. |
| Best Practice | "If replicas are increasing but pods remain Pending, investigate scheduling and node capacity rather than blindly tuning the pod scaler." |
| Aha (§2c) | Pod scaling and infrastructure scaling are different control loops — one cannot do the other's job. |

Every example elsewhere in this document (§2b's queue-depth reasoning chain, §2c's Pending-pod reveal, §3's BAD/GOOD question framing) is drawn from this one reference story so that the constitution's own examples stay internally consistent rather than each illustrating a different, incompatible version of the EKS narrative.

---

## F. Validation checklist (toward automation)

Two tiers: mechanical (schema-checkable today or with §9/§B's proposed extensions) and judgment (requires a human or eventually ASTRA; not schema-checkable even in principle).

**Mechanical — checkable by a script once §9/§B exist:**
1. Every `video-narrative.stages[].stage` value is unique (no stage listed twice) unless it's a deep-dive with declared `sub_narratives`.
2. For `target_duration_class: "standard"` or `"deep-dive"`, every REQUIRED-tier stage (§2a: problem, curiosity, context_mental_model, investigation_demonstration, decision, best_practice) appears somewhere in `stages[]`. For `"short"`, only the §3a minimum signature (problem, curiosity, one of {context_mental_model, investigation_demonstration}, best_practice) is required — this check reads `target_duration_class` before deciding which stages are mandatory, rather than applying one fixed list to every video.
3. Every RECOMMENDED-tier stage (stakes, options, trade_offs) absent from `stages[]` in a `"standard"`/`"deep-dive"` video produces a warning, not a failure — surfaced for human review (judgment gates 12-13, below: is the omission genuine or lazy?), never blocking.
4. Every listed stage has at least one `beat_refs` entry, and every referenced beat id actually exists in the corresponding `Beat[]` data file.
5. Stage order in the `stages` array matches the canonical order in §2 (Problem before Stakes before Curiosity, etc., skipping absent stages) — a script can check array order directly.
6. `options_covered` (if present) is a subset of `experience.yaml`'s `options[].name` (§9) — flags a video that silently drops an option the experience claims exists.
7. Every beat's `caption` field contains no literal `"NARRATION"`, `"CAPTION"`, `"VOICEOVER"`, or beat/act-name substring (regex-checkable — a mechanical enforcement of §7, catching a regression of the bug this repo already fixed once).
8. Beat `duration` values are all traceable to a real synthesized-audio manifest entry (already true today via the Chatterbox pipeline's `.manifest.json` — checkable by confirming every `audioFile` reference resolves to a manifest entry with a matching `durationSeconds`).

**Judgment — requires human (or future ASTRA) review, grouped by who/what they bind. The brief's original fourteen gates are items 9–17 and 19–23 (renumbered as this document evolved); items 14–15, 18, and 24–26 were added across refinements to check the reasoning-spine, primary-question, numbers-must-animate, and aha-moment principles specifically, since those needed their own explicit checks rather than being assumed to fall out of the others.**

*Binds the narrative spec (reviewed before any beat is animated):*
9. Can the learner state the problem after the first 20-30 seconds?
10. Is there a genuine question creating curiosity (not clickbait — must come from a real contradiction/surprise/failure/decision)?
11. Does the learner get the minimum mental model needed, no more, before implementation?
12. Are 2+ real alternatives presented before one is favored, where alternatives genuinely exist? (Not required where they don't — see §2a on RECOMMENDED-tier omission.)
13. Are trade-offs stated as "solves X, does not solve Y" for each alternative, not just definitions?
14. **(§2b)** Could `central_question` be answered by "look up the technology's docs," or does it require weighing something? A question answerable by a definition lookup has not cleared this gate.
15. **(§3)** Does every `secondary_questions` entry visibly serve `central_question`, or does the video quietly chase a second, unrelated topic?

*Binds the beat/visual layer (reviewed after beats are drafted, before final render):*
16. Does every major animation answer "what changed / why / what caused it / what consequence" (§5)?
17. Does the demonstration show cause-and-effect changing on screen, not just get described in narration?
18. **(§5, "numbers that change must animate through the change")** For every quantity the narration describes as rising, falling, or scaling, does the on-screen number actually count/tween through that range, or does it cut straight to the new value? A beat that fades in an already-final number when the caption says "climbing from X to Y" fails this gate even if gate 17 technically passes — this is the specific defect found in `exp-inference-under-load`'s Investigation stage (§C) and is checked separately because it's easy to rubber-stamp as "something changed" without checking *how*.
19. Are subtitles clean transcript-only text (mechanically checkable per item 7 above, but a human should also confirm no *implicit* metadata leaked in, e.g. a caption that reads like a slide title rather than spoken language)?
20. Does the narration sound like an explanation between engineers, not documentation (spot-check against §8's four caption questions and phrase bank)?

*Binds the whole finished video (reviewed on the rendered output):*
21. Does the learner understand why the chosen solution was selected, not just what it is?
22. Are there specific, actionable best practices (not generic "monitor everything")?
23. Are the final takeaways (where present — OPTIONAL tier, §2a) measurable and tied back to the opening problem?
24. Could the learner explain the concept without having memorized the script (i.e., did they get the reasoning, not just the words)?
25. Does the video avoid unnecessary terminology relative to what the central question actually requires?
26. **(§2c)** Can a reviewer point to one specific moment as *the* aha moment — the point where a stated contradiction resolves into an insight? If every reviewer names a different moment, or no one can name one, the video has probably drifted into stating facts in sequence rather than building toward a reveal.

If several judgment gates fail, the video is pedagogically incomplete regardless of rendering quality — this is the brief's own framing and is adopted verbatim as the constitution's closing test.

---

## Adoption path

**Status of each step**, updated per the approval of this refinement:

1. ~~**Review and approval of this document.**~~ **Done.** The reasoning spine, the REQUIRED/RECOMMENDED/OPTIONAL tiering, the narrative model in [§B](#b-proposed-schema-narrative-structure-video-specification-ir), and the validation rules in [§F](#f-validation-checklist-toward-automation) are adopted as written.
2. **Not yet done.** Add `options`/`decision`/`best_practices` to `schemas/experience.schema.json` as optional fields (§9) — additive, no migration needed, matches the precedent already set.
3. **Not yet done.** Design and add `schemas/video-narrative.schema.json` (§B) as a new schema, plus decide where its instances live (proposed: `experience-catalog/<exp>/artifacts/video-narrative/<id>.yaml`, sibling to the existing `art-*.yaml` files, since it's a refinement of the Video artifact spec, not a new artifact type).
4. **Not yet done.** Migrate `artifact-spec.schema.json`'s `video` branch's `script_outline` field to the stricter `{stage, summary}[]` shape (§9) — this is the one breaking change; existing video artifact instances (`art-inference-under-load-video.yaml`, `art-deploy-inference-service-video.yaml`) would need their `script_outline` arrays reshaped to match.
5. **Not yet done.** Write the mechanical validators from [§F](#f-validation-checklist-toward-automation) items 1-8 as an actual script (likely alongside the existing `docs/validation-guide.md` tooling) — including the REQUIRED-vs-RECOMMENDED distinction (fail vs. warn), not just presence/absence checking.
6. **Not yet done.** Only then, retrofit or rewrite `exp-inference-under-load`'s narrative spec against this constitution ([§C](#c-mapping-onto-exp-inference-under-load) already shows this is a targeted fix — add a Problem cold-open, add an Options beat, crystallize one Best Practice line, and re-order Curiosity ahead of the mental model — not a full rebuild).
7. **Not yet done.** Apply to the next new video from spec-first (author the `video-narrative` document, get it reviewed against §F's judgment gates, *then* write beats) — proving the workflow end-to-end on a topic other than EKS autoscaling, since a second application is what actually tests whether §2's "not a checklist" instruction survives contact with unfamiliar content.

Steps 2-7 remain future work. This refinement performs step 1 only — it changes what the law says, not yet the schemas, validators, or any rendered video.
