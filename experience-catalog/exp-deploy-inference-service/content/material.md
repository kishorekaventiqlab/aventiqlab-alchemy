# Deploying GPU Workloads on Kubernetes: Reference

*Reference material for [`exp-deploy-inference-service`](../experience.yaml) · Artifact: [`art-deploy-inference-service-material`](../artifacts/art-deploy-inference-service-material.yaml) · ~15 min read*

This document builds the KNOW/UNDERSTAND foundation you need before the Lab or Skill Evaluator for this experience. It is reference material, not a story — if you want to see this reasoning applied to a live chart adaptation, watch the [Video](video-script.md) next.

---

## 1. Taints, tolerations, and node selectors for GPU scheduling

A CPU-only Helm chart deploys fine on any general-purpose node because there's nothing stopping the scheduler from placing it anywhere with free capacity. A GPU workload is different: GPU nodes are expensive, shared, and usually protected so that non-GPU workloads can't accidentally land on them and waste that capacity. Understanding how that protection works — and how to correctly ask for an exception to it — is the first thing a chart adaptation needs to get right.

### What a taint actually does

A **taint** is applied to a *node*, not a pod. It says, in effect, "don't schedule anything here unless it explicitly says it's okay." A taint has three parts: a key, a value, and an effect. The most common effect is `NoSchedule` — the scheduler will refuse to place a pod on a tainted node unless that pod carries a matching **toleration**.

```
kubectl describe node <gpu-node-name>
```

will show something like:

```
Taints: nvidia.com/gpu=present:NoSchedule
```

This is the node telling the scheduler "only pods that tolerate `nvidia.com/gpu=present` may land here." Critically, a taint by itself only *repels* — it doesn't *attract*. A pod with the matching toleration is merely *allowed* to schedule on the tainted node; it isn't required to, and it won't be automatically routed there over an untainted node.

### What a node selector does, and why you need both

That's where **node selectors** (or the more expressive `nodeAffinity`) come in. A node selector is set on the *pod spec* and says "only schedule this pod on nodes matching this label" — for example:

```yaml
nodeSelector:
  node-pool: gpu-inference
```

Tolerations and node selectors solve two different halves of the same problem:
- The **toleration** answers "is this pod *allowed* to land on a protected node?"
- The **node selector** answers "*where specifically* should this pod land?"

A very common mistake is adding one without the other. A pod with only a toleration (no node selector) *can* land on the GPU node pool, but the scheduler is also free to place it on any other untainted node that happens to have capacity — which, for a workload that genuinely needs a GPU, means it will start up and immediately fail because there's no GPU device to attach to. A pod with only a node selector (no toleration) will never even reach the tainted node — it stays `Pending` indefinitely, because the taint rejects it before the node selector's preference is ever consulted.

**The practical rule:** a GPU-scheduled pod needs *both* the toleration (permission to land on the tainted pool) and the node selector or affinity rule (a positive instruction to land there specifically), not one or the other.

### Reading the mismatch from symptoms

If a pod is stuck in `Pending`, `kubectl describe pod <pod-name>` is the fastest way to find out why — the Events section will typically say something like:

```
Warning  FailedScheduling  ... 0/6 nodes are available: 3 node(s) had untolerated taint
{nvidia.com/gpu: present}, 3 node(s) didn't match Pod's node affinity/selector.
```

That single line is telling you both halves of the story: some nodes rejected the pod on the taint, and the others didn't match the selector. Reading this message before guessing is what turns a Pending-pod cycle into a two-minute fix instead of a trial-and-error one.

---

## 2. What the NVIDIA device plugin does — and how to tell it's working

A tainted, correctly-selected node still isn't enough on its own. Kubernetes has no built-in concept of "GPU" as a schedulable resource the way it understands CPU and memory — that awareness has to be added.

### The device plugin's job

The **NVIDIA device plugin** is a DaemonSet that runs on every GPU node and does two things:
1. **Discovers** the physical GPUs present on that node.
2. **Advertises** them to the Kubernetes API as an **extended resource** — `nvidia.com/gpu` — with a count, so the scheduler can treat "1 GPU" as a resource quantity exactly like it treats CPU cores or memory.

Once the device plugin is running and healthy, a pod requests a GPU the same way it requests CPU/memory, in its resource requests/limits:

```yaml
resources:
  limits:
    nvidia.com/gpu: 1
```

Note that **GPU resources in Kubernetes are always specified as a `limit`, and only whole integers are supported** for the standard device plugin — there's no such thing as requesting "0.5 GPU" through this mechanism (that requires a different mechanism entirely, like MIG or time-slicing, which is out of scope for a first deployment).

### Confirming it's actually working

A common mistake is assuming the device plugin is running just because the DaemonSet shows `Running`. What actually confirms it's *working* is that the node's **allocatable resources** list `nvidia.com/gpu` with a nonzero count:

```
kubectl describe node <gpu-node-name> | grep -A5 Allocatable
```

If `nvidia.com/gpu` doesn't appear there at all, the device plugin isn't successfully registering GPUs on that node — and no amount of correcting taints/tolerations/selectors on your pod will fix that, because the underlying resource the pod is asking for doesn't exist as far as the scheduler is concerned. This is a different failure than a scheduling mismatch, and it's worth checking early rather than assuming your chart's toleration/selector logic is the problem when the real gap is one layer lower.

---

## 3. Why "Running" isn't "healthy": readiness probes vs. real inference checks

Once a pod schedules successfully and its container starts, `kubectl get pods` will show `STATUS: Running`. It is tempting to treat this as "the deployment worked." It is not sufficient evidence of that, and the gap between the two is one of the most common ways a service ships broken.

### What "Running" actually confirms

`Running` means the container process started and hasn't crashed. That's it. It says nothing about whether:
- the model finished loading into GPU memory (which, for a large model, can take much longer than the container's startup)
- the inference server is actually listening and accepting connections
- a real request produces a real, correct response

### What a readiness probe adds — and where it still falls short

A **readiness probe** is a periodic check Kubernetes runs against a running container to decide whether it should receive traffic. For a serving container, a well-configured readiness probe (commonly an HTTP `GET` against a `/health` or `/ready` endpoint) is a meaningful improvement over "Running" alone, because it can confirm the process is not just alive but responsive.

However, a readiness probe is only as good as what it checks. A shallow readiness probe that just confirms the HTTP server is accepting connections — without confirming the model is actually loaded — will report `Ready: true` while the service is still returning errors or empty responses to real inference requests. This is the exact gap this experience's second learning outcome is built around: **a passing readiness probe and a genuinely working inference response are not the same claim**, and only the second one is real evidence the deployment succeeded.

### The practical takeaway

The only evidence that actually closes the loop is a real end-to-end inference request against the deployed endpoint, with a response that matches what the model is supposed to produce — not just a `200 OK`. When verifying a new deployment (in this lab or in production), always pair the readiness/health check with at least one genuine inference call, and treat the pod's `Running` status as necessary but nowhere close to sufficient.

---

## Summary

| Layer | What it tells you | What it does *not* tell you |
|---|---|---|
| Taints/tolerations/selectors | Whether the pod is allowed to and instructed to land on the GPU node pool | Whether a GPU is actually available to attach once it lands there |
| Device plugin / allocatable `nvidia.com/gpu` | Whether the node can actually offer a GPU resource to schedule against | Whether the specific pod correctly requested it |
| Pod status `Running` | Whether the container process started without crashing | Whether the service inside it is ready for traffic |
| Readiness probe | Whether the service is responding to a shallow health check | Whether the service produces a correct real inference response |
| Real inference request/response | Whether the service is genuinely working end to end | — this is the actual bar |

Each layer above answers a narrower question than the one below it looks like it's answering. The failure modes in this experience (a Pending pod, or a "healthy" service that isn't) both come from stopping one layer too early.
