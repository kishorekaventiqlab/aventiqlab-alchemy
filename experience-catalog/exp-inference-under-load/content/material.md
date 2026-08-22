# GPU Inference Capacity & Autoscaling Signals

*Reference material for [`exp-inference-under-load`](../experience.yaml) · Artifact: [`art-inference-under-load-material`](../artifacts/art-inference-under-load-material.yaml) · ~20 min read*

This document builds the KNOW/UNDERSTAND foundation you need before the Lab or Skill Evaluator for this experience. It is reference material, not a story — if you want to see this reasoning applied to a live incident, watch the [Video](video-script.md) next.

---

## 1. GPU utilization signals: what they do and don't tell you

When something is slow on a GPU-backed inference service, the first instinct is usually to open a dashboard and look at "GPU utilization." That number is useful, but it is also one of the most commonly misread metrics in AI infrastructure work — because a high percentage does not always mean what you think it means.

### What GPU utilization actually measures

On NVIDIA GPUs, the utilization percentage reported by `nvidia-smi` and scraped by the DCGM exporter is, roughly, *the percentage of time in the last sampling window during which at least one GPU kernel was executing*. That's a meaningfully different claim than "the GPU is doing as much useful work as it can."

A GPU can report 95% utilization while still being far from its actual compute ceiling, if the kernels running during that 95% are small, poorly batched, or frequently interrupted by data transfers. Conversely, a well-batched, compute-dense workload running at 70% utilization might already be extracting more useful throughput than a poorly-batched workload at 95%.

This is why utilization alone should never be your only signal. You need at least one more axis:

### GPU memory utilization: the second axis

Memory utilization tells you a different story: how much of the GPU's VRAM is currently allocated. This matters for two reasons:

1. **Distinguishing compute-bound from memory-bound.** If GPU (compute) utilization is climbing toward its ceiling *and* memory utilization is flat, that's a strong signal you're compute-bound — the GPU is doing as much arithmetic as it can, and adding more concurrent requests won't help; it'll just queue. If both are climbing together, you may be memory-bound instead — you're running out of room to hold activations, KV-cache, or batched inputs, and the fix is different (reduce batch size, reduce context length, or add memory, not just add compute).
2. **Detecting a memory leak versus organic growth.** A memory utilization curve that ratchets upward over hours with no corresponding traffic growth is a leak, not a load story — this is a different investigation entirely (see the [Diagnose Model-Serving Latency](../../exp-diagnose-model-serving-latency/experience.yaml) experience for how workload-shape drift is diagnosed similarly for latency).

### SM occupancy: a third, less commonly used signal

Streaming Multiprocessor (SM) occupancy — the fraction of a GPU's parallel execution units that are actively scheduled with work at a given instant — is a finer-grained signal than utilization. High utilization with low SM occupancy usually means your kernels are latency-bound (waiting on memory access) rather than compute-bound. This is a more advanced diagnostic and not something you'll need for most day-to-day operational decisions, but it's worth knowing it exists for cases where utilization and memory both look "fine" and latency is still degrading.

### The practical takeaway

When investigating a GPU-related performance problem, pull at least two signals together — never conclude "compute-bound" or "memory-bound" from utilization alone. The pairing of **GPU utilization climbing + GPU memory flat** is one of the most reliable compute-saturation signatures you'll encounter, and it's exactly the pattern this experience's reference incident exhibits.

---

## 2. Kubernetes autoscaling primitives and their trigger signals

AI/ML platform engineers routinely work with several different autoscaling mechanisms, and confusing their scope is a common and costly mistake — especially under incident pressure, when the instinct is to "just scale it" without checking which layer is actually the bottleneck.

| Primitive | What it scales | What signal it reacts to | What it *cannot* do |
|---|---|---|---|
| **HPA** (Horizontal Pod Autoscaler) | Replica count of a Deployment/StatefulSet | Built-in: CPU/memory. Extended: custom metrics via an adapter | Cannot add cluster capacity — if there's nowhere to schedule new pods, HPA scaling up does nothing but create Pending pods |
| **VPA** (Vertical Pod Autoscaler) | Resource requests/limits of existing pods | Historical resource usage | Requires pod restarts to apply changes (in most modes) — not useful for reacting to a live spike |
| **KEDA** | Replica count, like HPA, but reacting to a much broader range of external metrics (queue depth, Kafka lag, Prometheus queries, cron schedules) | Whatever scaler you configure — commonly queue depth for inference workloads | Same capacity ceiling problem as HPA — it scales your *replica count request*, not your *available nodes* |
| **Cluster Autoscaler / Karpenter** | Number of nodes in the cluster | Pending pods that can't be scheduled due to insufficient node capacity | Bounded by your cloud account's service quota for the instance type — this is the layer where a GPU quota ceiling actually bites |

### Why this table matters under pressure

The most common mistake in a capacity incident is treating "autoscaling isn't helping" as one undifferentiated problem, when it's actually a chain with three distinct potential failure points:

1. **Is the pod-level autoscaler (HPA/KEDA) even configured to react to the right signal?** A CPU-based HPA on a GPU-bound inference workload will not scale in response to GPU saturation — CPU utilization on an inference pod is often nearly flat regardless of GPU load, because the CPU is just orchestrating requests, not doing the compute.
2. **Is the pod-level autoscaler already at its configured maximum?** If KEDA is correctly configured and reacting, but `maxReplicaCount` has been reached, no amount of additional load will trigger more replicas — this looks identical to "autoscaling is broken" from a symptom standpoint but has a completely different fix (raise the ceiling, or reduce demand — see the [Video](video-script.md) for exactly this situation).
3. **Is the node-level autoscaler (Cluster Autoscaler/Karpenter) able to add capacity?** Even with headroom in `maxReplicaCount`, new pods can't schedule if there's no node capacity — and node capacity for GPU instance types is where the account-level service quota constraint applies.

Reading `kubectl get scaledobject` and `kubectl describe` on stuck pods, in that order, is almost always faster than guessing which layer is the problem.

---

## 3. GPU service quotas and why they aren't an instant lever

Every cloud account has a service quota — a hard ceiling on how many of a given GPU instance type you can run simultaneously, usually set well below what the region can theoretically support, as a cost-control and blast-radius-limiting default.

### Why this matters operationally

A GPU service quota ceiling produces a symptom that looks a lot like "the autoscaler is broken": your Cluster Autoscaler or Karpenter tries to add a node, the cloud provider's API rejects the request (or silently fails to provision), and pods stay Pending indefinitely. The autoscaler logs will usually tell you exactly why — reading that failure reason directly, rather than guessing, is the fastest path to a correct diagnosis (see [Diagnose GPU Capacity Exhaustion](../../exp-diagnose-gpu-capacity-exhaustion/experience.yaml) for a full worked example).

The critical operational fact: **a quota increase request is not an immediate mitigation.** Depending on the cloud provider and the size of the request, approval can take anywhere from minutes to multiple business days, especially for less common GPU instance families. If you are in the middle of an active incident and your only proposed fix is "request a quota increase," you have not yet proposed a mitigation — you've proposed something that might help hours from now, at best.

### What you can actually do within a fixed quota ceiling

When capacity is fixed and demand exceeds it, your options fall into two categories:

- **Reduce demand.** Rate-limit or shed lower-priority traffic, defer non-urgent requests, or apply backpressure at the gateway layer.
- **Reduce per-request cost.** Lower batch size or model precision temporarily to serve more requests within the same compute envelope, accepting a quality or latency tradeoff.

Both of these are real tradeoffs, not free wins — and stating the tradeoff explicitly (who is affected, and how) is part of doing this well, not an afterthought. This is exactly the decision structure you'll practice in this experience's Lab.

### A longer-term view

None of the above replaces actually planning capacity. A recurring pattern of hitting a quota ceiling during traffic spikes is a signal to design around it — an overflow node pool in a second instance family with pre-approved burst quota, a documented and pre-negotiated shedding policy, or a proactive quota increase requested *before* you need it, not during the incident. This is the kind of proposal you're expected to make in this experience's third decision point.

---

## 4. Dynamic batching: the throughput/latency tradeoff

Model-serving runtimes like Triton and vLLM support dynamic batching: grouping multiple incoming requests together and running them through the model as a single batched forward pass, rather than one request at a time.

### Why batching exists

GPUs are throughput-optimized parallel processors. Running one request at a time badly underutilizes them — a huge fraction of the GPU's parallel compute capacity sits idle waiting on a single small input. Batching multiple requests together lets the GPU do meaningfully more useful work per unit of wall-clock time, which is why virtually every production model-serving setup uses some form of it.

### The tradeoff that batching introduces

Batching is not free. To form a batch, the serving runtime has to wait — for a configured time window, or until a configured batch size is reached, whichever comes first — before running inference. That waiting time is added latency for whichever request arrived first in the batch.

This creates a direct, tunable tradeoff:

- **Larger batch size / longer batching window** → higher throughput (more requests served per second, better GPU utilization), but higher latency for individual requests, especially the ones that arrive early in the batch-formation window.
- **Smaller batch size / shorter batching window** → lower latency per request, but lower throughput and worse GPU utilization — you're leaving compute capacity on the table.

### Why this matters for capacity decisions

Understanding this tradeoff is what lets you reason correctly about a mitigation like "reduce batch size to protect latency" versus "increase batch size to protect throughput under a fixed replica ceiling." Neither is universally correct — it depends on which side of your SLA is actually at risk. A service with a strict p99 latency SLA and headroom on throughput should favor smaller batches; a service that's latency-tolerant but capacity-constrained should favor larger ones.

This is also why "just batch more aggressively" is not a substitute for the capacity reasoning in section 3 above — batching changes how efficiently you use the GPU capacity you have, but it does not create GPU capacity you don't have.

---

## Summary

Before moving on to the Video or Lab for this experience, you should be able to:

- State the difference between GPU compute utilization, GPU memory utilization, and SM occupancy, and know which combination signals a compute-bound versus memory-bound service.
- Correctly map HPA, VPA, KEDA, and Cluster Autoscaler/Karpenter to the specific signal each one reacts to, and explain why a pod-level autoscaler being "maxed out" is a different failure mode than a node-level autoscaler being quota-blocked.
- Explain why a GPU service quota increase is not an immediate incident mitigation, and name at least two levers that *are* available within a fixed quota ceiling.
- Explain the throughput/latency tradeoff that dynamic batching introduces, and reason about which direction to tune it given a specific SLA constraint.

If any of these feel shaky, that's what the [Quiz](quiz.yaml) is for — it checks exactly this content before you're trusted with the Lab.
