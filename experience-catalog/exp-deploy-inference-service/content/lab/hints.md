# Hints

Read one level at a time — try the task again after each hint before reading the next.

## Task 1 — Confirming the real taint and label

**Hint 1:** `kubectl get nodes -l node-pool=gpu-inference --show-labels` only returns a result if that label already matches at least one node — if it returns nothing, list all nodes with `kubectl get nodes --show-labels` and look for whatever label your sandbox cluster actually used, rather than assuming `node-pool=gpu-inference` is universal.

**Hint 2:** `kubectl describe node <node-name>` shows taints near the top of the output, right after `Labels`. The format is `key=value:effect` — all three parts matter for the toleration you write next.

## Task 2 — Helm values

**Hint 1 (nodeSelector/tolerations):** The node selector and toleration must use the *exact* key/value you confirmed in Task 1 — not the example shown in the code comments, if your sandbox cluster differs. A toleration's `key`, `value`, and `effect` must all match the taint precisely; a mismatch on any one field means the taint still rejects the pod.

**Hint 2 (GPU resource):** GPU resources go under `resources.limits`, not `resources.requests`, and are always whole numbers with the standard device plugin: `nvidia.com/gpu: 1`. See [`content/material.md`](../material.md) section 2 for why fractional values aren't supported this way.

**Hint 3 (readiness probe):** The probe needs `httpGet.path: /health` and `httpGet.port` matching the service port (8080). `initialDelaySeconds` should be generous enough to cover model load time — too short, and Kubernetes will start sending traffic (or restarting the container on probe failure) before the model has finished loading; 30 seconds is a reasonable starting point for this lab's model size.

## Task 3 — Verifying with a real request

**Hint 1:** If `kubectl port-forward` reports the pod isn't found or isn't ready, re-check `kubectl get pods` first — a pod that's still `0/1 Ready` will accept the port-forward connection but the request will hang or fail, which is itself useful evidence the readiness probe hasn't passed yet.

**Hint 2:** If the `curl` request returns a `200` with an empty or malformed body, that's exactly the gap described in [`content/material.md`](../material.md) section 3 — a passing HTTP status is not the same as a correct response. Check the container logs (`kubectl logs <pod-name>`) for a model-loading error before assuming the request itself is malformed.
