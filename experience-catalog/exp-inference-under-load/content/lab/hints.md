# Hints

Read one level at a time — try the task again after each hint before reading the next.

## Task 1 — KEDA ScaledObject

**Hint 1:** The metric name and label are given in the code comment: `inference_gateway_queue_depth{service="doc-search-summarizer"}`. PromQL for "the current value of this gauge" is just the metric selector itself — no aggregation function needed for a single-series gauge.

**Hint 2:** `threshold` in a KEDA Prometheus trigger is a string, not a number, even though it represents a numeric value — quote it: `threshold: "5"`.

**Hint 3:** `minReplicaCount: 2` keeps two replicas warm at all times (avoiding cold-start latency on the first request after a scale-to-zero), and `maxReplicaCount: 12` matches the node pool's confirmed headroom mentioned in the README — going higher would just produce Pending pods once the node pool is full, per [`content/material.md`](../material.md) section 2.

## Task 2 — Rate limit policy

**Hint 1:** The paid-tier rule uses `action: allow` — the free-tier rule's action for *reducing* traffic (not blocking it entirely) is `action: reduce`.

**Hint 2:** The reduction amount and duration are stated explicitly in [Beat 7 of the video script](../video-script.md): "cuts free-tier request volume by 40% for the next hour."

## Task 3 — Terraform overflow node pool

**Hint 1:** `scaling_config` on an `aws_eks_node_group` needs `desired_size`, `min_size`, and `max_size`. An overflow pool that's normally idle should have `min_size = 0` and `desired_size = 0` — it only scales up during an explicit overflow event, not by default.

**Hint 2:** `instance_types` should be a *different* family from the primary pool (`g5.2xlarge`) — the module's purpose is a second instance family for burst capacity, e.g. `g5.4xlarge`, per the README's description.

**Hint 3:** A taint like `key = "overflow-only", value = "true", effect = "NO_SCHEDULE"` keeps normal workloads off this pool. Only pods with a matching toleration (applied during an actual overflow event, not by default) would schedule here.
