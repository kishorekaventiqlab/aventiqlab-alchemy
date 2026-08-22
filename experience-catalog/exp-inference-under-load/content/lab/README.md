# Lab — Build the Mitigation and Overflow-Capacity Configuration

Artifact: [`art-inference-under-load-lab`](../../artifacts/art-inference-under-load-lab.yaml) · Estimated time: 90 minutes

Read [`content/material.md`](../material.md) first if you haven't. This lab is untimed — take the time to get it right.

## Environment

- A `kind` cluster or a sandbox EKS cluster with [KEDA](https://keda.sh) installed
- `kubectl` configured against that cluster
- Terraform CLI (`>= 1.5`)

If you don't have a cluster handy, `kind create cluster --name inference-lab` is enough to complete Tasks 1 and 2 (Task 3 is a Terraform module you write and `terraform validate`/`plan` — it is not applied against real AWS infrastructure in this lab).

## Task 1 — Complete the KEDA ScaledObject

Open [`keda-scaledobject.yaml`](keda-scaledobject.yaml). It's a real KEDA `ScaledObject` manifest with three `# TODO` gaps:

1. The Prometheus scaler's `query` is missing — it needs to select the inference gateway's queue-depth metric.
2. `minReplicaCount` / `maxReplicaCount` are unset.
3. The `metadata.threshold` for the Prometheus trigger is unset.

Fill in the TODOs, then apply it:

```bash
kubectl apply -f keda-scaledobject.yaml
kubectl get scaledobject doc-search-summarizer -n inference
```

Confirm `READY: True` and `ACTIVE` reflects current load. Compare your answer against [`keda-scaledobject.solution.yaml`](keda-scaledobject.solution.yaml) — don't peek until you've tried.

## Task 2 — Implement priority-tier request shedding

Open [`rate-limit-policy.yaml`](rate-limit-policy.yaml). It's a Gateway API `RateLimitPolicy`-style manifest (the shape used in the reference incident's mitigation — see [Beat 7 of the video script](../video-script.md)) with the `free-tier` shedding rule stubbed out.

Complete it so that:
- The `paid-tier` selector is **not** rate-limited.
- The `free-tier` selector is rate-limited to reduce its volume by 40%.

Apply it and confirm with `kubectl get ratelimitpolicy -n inference`. Compare against [`rate-limit-policy.solution.yaml`](rate-limit-policy.solution.yaml).

## Task 3 — Sketch the GPU overflow node pool module

Open [`terraform/gpu-overflow-node-pool/main.tf`](terraform/gpu-overflow-node-pool/main.tf). It's a starter Terraform module for a *second* GPU node pool in a different instance family (`g5.4xlarge` instead of the primary `g5.2xlarge` pool), intended as the "overflow pool" option named in the experience's third decision point.

Fill in the `# TODO` blocks: the `aws_eks_node_group` resource's `scaling_config`, the `instance_types` list, and the `taint` that keeps normal workloads off this pool by default (it should only take traffic during an explicit overflow event, not by default). Run:

```bash
cd terraform/gpu-overflow-node-pool
terraform init
terraform validate
```

`terraform validate` passing is the completion bar for this task — this module is not applied against real infrastructure in the lab. Compare against [`main.solution.tf`](terraform/gpu-overflow-node-pool/main.solution.tf).

## Hints

Stuck on any task? [`hints.md`](hints.md) has progressive hints — read one level at a time.
