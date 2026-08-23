# Lab — Deploy the GPU-Scheduled Inference Service

Artifact: [`art-deploy-inference-service-lab`](../../artifacts/art-deploy-inference-service-lab.yaml) · Estimated time: 60 minutes

Read [`content/material.md`](../material.md) first if you haven't. This lab is untimed — take the time to get it right, and check real cluster state before writing each fix rather than assuming.

## Environment

- A `kind` cluster (or a sandbox EKS cluster) with a tainted node labeled to simulate a GPU node pool, and the NVIDIA device plugin installed if you want the resource request to actually schedule (see note below if you don't have real GPU hardware)
- `kubectl` configured against that cluster
- Helm CLI

If you don't have real GPU hardware available, you can still complete Tasks 1 and 2 by simulating the taint/label on a regular node and using an [extended-resource fake device plugin](https://kubernetes.io/docs/tasks/administer-cluster/extended-resource-node/) or by temporarily removing the `nvidia.com/gpu` limit to test scheduling logic only — the important part of this lab is getting the toleration/selector/probe *logic* right, which you can verify without physical GPUs.

To simulate the tainted pool:

```bash
kind create cluster --name deploy-inference-lab
kubectl label node deploy-inference-lab-control-plane node-pool=gpu-inference
kubectl taint node deploy-inference-lab-control-plane node-pool=gpu-inference:NoSchedule
```

## Task 1 — Confirm the real taint and label before touching the chart

Don't assume the taint key/value shown in the code comments matches your actual cluster — confirm it yourself:

```bash
kubectl get nodes -l node-pool=gpu-inference --show-labels
kubectl describe node <node-name> | grep -A2 Taints
```

Only once you've confirmed both should you move to Task 2.

## Task 2 — Complete the Helm values file

Open [`values.yaml`](values.yaml). It's the existing CPU-service chart's values file with four `# TODO` gaps:

1. `nodeSelector` is empty — add the label matching the GPU node pool you confirmed in Task 1.
2. `tolerations` is empty — add a toleration matching the taint you confirmed in Task 1.
3. `resources.limits` has no GPU resource — the container image for this model requires exactly 1 GPU.
4. `readinessProbe` is empty — the inference server exposes a real health check at `GET /health` that only returns `200` once the model has finished loading.

Fill in the TODOs, then deploy:

```bash
helm install sentiment-analysis ./chart -f values.yaml
kubectl get pods -l app=sentiment-analysis -w
```

Confirm the pod reaches `Running` and `1/1 Ready` — not just `Running`. Compare your answer against [`values.solution.yaml`](values.solution.yaml) — don't peek until you've tried.

## Task 3 — Verify with a real inference request, not pod status

A `Running` pod with a passing readiness probe is **not** sufficient evidence the deployment worked — see [`content/material.md`](../material.md) section 3 for why. Confirm the service is genuinely serving correct responses:

```bash
kubectl port-forward svc/sentiment-analysis 8080:8080
curl -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{"text": "This product exceeded my expectations."}'
```

You should get back a real JSON response with a sentiment label and confidence score — not an error, and not an empty body. Capture this request/response pair as your evidence of competence for this experience (see [`out-deploy-inference-service-02`](../../outcomes/out-deploy-inference-service-02.yaml)).

## Hints

Stuck on any task? [`hints.md`](hints.md) has progressive hints — read one level at a time.
