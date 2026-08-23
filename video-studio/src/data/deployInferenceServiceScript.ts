// Source of truth: /experience-catalog/exp-deploy-inference-service/content/video-script.md
// If you edit the narration there, regenerate audio with
// `npm run generate:audio -- deployInferenceServiceScript` (Chatterbox V3, local/offline),
// then update this file's start/duration values to match each beat's new measured
// audio length + a ~3s buffer (see public/audio/deployInferenceServiceScript/deployInferenceServiceScript.manifest.json
// after regenerating, and inferenceUnderLoadScript.ts's original Production notes for
// why durations are audio-driven rather than hand-picked).
export const FPS = 30;

export type TerminalLine = {
  kind: 'prompt' | 'output';
  text: string;
};

export type EditorLine = {
  kind: 'existing' | 'added' | 'comment' | 'placeholder';
  text: string;
};

export type Beat =
  | {
      type: 'title';
      start: number;
      duration: number;
      title: string;
      subtitle: string;
      audioFile?: string;
    }
  | {
      type: 'editor';
      start: number;
      duration: number;
      caption: string;
      filename: string;
      lines: EditorLine[];
      focusLineIndex?: number;
      audioFile?: string;
    }
  | {
      type: 'terminal';
      start: number;
      duration: number;
      caption: string;
      lines: TerminalLine[];
      focusLineIndex?: number;
      audioFile?: string;
    }
  | {
      type: 'recap';
      start: number;
      duration: number;
      caption: string;
      items: string[];
      audioFile?: string;
    };

export const deployInferenceServiceScript: Beat[] = [
  {
    type: 'title',
    start: 0,
    duration: 8,
    title: 'Watching a Chart Get Adapted for GPU Scheduling',
    subtitle: 'A different model. A similar chart. Watch how the checks happen before anything gets applied.',
  },
  {
    type: 'editor',
    start: 8,
    duration: 14.8,
    audioFile: 'beat2.wav',
    filename: 'fraud-scoring-api/values.yaml',
    caption:
      "We've got a CPU-only Helm chart that's worked fine for months, and a new model that needs a GPU. Same chart, new requirement. Let's adapt it — and the point isn't just what changes, it's what I check before I change anything.",
    lines: [
      { kind: 'existing', text: 'replicaCount: 2' },
      { kind: 'existing', text: '' },
      { kind: 'existing', text: 'image:' },
      { kind: 'existing', text: '  repository: internal-registry/fraud-scoring-model' },
      { kind: 'existing', text: '  tag: "2.3.0"' },
      { kind: 'existing', text: '' },
      { kind: 'comment', text: '# no nodeSelector, no tolerations, no GPU resources - CPU-only chart' },
      { kind: 'existing', text: 'resources:' },
      { kind: 'existing', text: '  limits:' },
      { kind: 'existing', text: '    cpu: "1"' },
      { kind: 'existing', text: '    memory: "2Gi"' },
    ],
  },
  {
    type: 'terminal',
    start: 22.8,
    duration: 27.1,
    audioFile: 'beat3.wav',
    caption:
      "First real step: I'm not guessing the taint key — I'm reading it off the actual node pool. kubectl describe node, and there it is: workload-type=gpu, effect NoSchedule. That's the exact key and value my toleration needs to match. If I'd assumed a generic nvidia.com/gpu taint because that's the common convention, I'd have gotten this wrong — this cluster's platform team tags their GPU pools differently. Checking first instead of assuming is the single habit that avoids the most common version of this mistake.",
    lines: [
      { kind: 'prompt', text: 'kubectl get nodes -l node-pool=gpu-scoring -o wide' },
      { kind: 'output', text: 'NAME          STATUS   ROLES   AGE   VERSION' },
      { kind: 'output', text: 'gpu-node-01   Ready    <none>  40d   v1.29.2' },
      { kind: 'output', text: 'gpu-node-02   Ready    <none>  40d   v1.29.2' },
      { kind: 'output', text: 'gpu-node-03   Ready    <none>  12d   v1.29.2' },
      { kind: 'prompt', text: 'kubectl describe node gpu-node-01 | grep -A1 Taints' },
      { kind: 'output', text: 'Taints:  workload-type=gpu:NoSchedule' },
    ],
    focusLineIndex: 6,
  },
  {
    type: 'terminal',
    start: 49.9,
    duration: 33.2,
    audioFile: 'beat4.wav',
    caption:
      "Second check, before I even open the chart: is this node pool actually able to hand out a GPU resource? The taint tells me a pod is allowed to land here — it doesn't tell me a GPU is available once it does. Allocatable shows nvidia.com/gpu: 4 — good, the device plugin is running and advertising GPUs correctly on this node. If this line were missing, no toleration or node selector I write in the chart would matter, because the resource I'm about to request wouldn't exist from the scheduler's point of view.",
    lines: [
      { kind: 'prompt', text: 'kubectl describe node gpu-node-01 | grep -A5 Allocatable' },
      { kind: 'output', text: 'Allocatable:' },
      { kind: 'output', text: '  cpu:                7500m' },
      { kind: 'output', text: '  memory:              30Gi' },
      { kind: 'output', text: '  nvidia.com/gpu:      4' },
      { kind: 'output', text: '  pods:                110' },
    ],
    focusLineIndex: 4,
  },
  {
    type: 'editor',
    start: 83.1,
    duration: 26.5,
    audioFile: 'beat5.wav',
    filename: 'fraud-scoring-api/values.yaml',
    caption:
      "Now the actual edit — and I'm adding all three pieces together, not one at a time, because they answer three different questions. The toleration says this pod is allowed on the tainted pool. The node selector says put it there specifically. And the resource limit is the actual GPU request — without it, even a pod that successfully schedules on the right node won't have a GPU attached to its container. Miss any one of these three and you get a different failure.",
    lines: [
      { kind: 'existing', text: 'replicaCount: 2' },
      { kind: 'existing', text: '' },
      { kind: 'added', text: 'nodeSelector:' },
      { kind: 'added', text: '  node-pool: gpu-scoring' },
      { kind: 'added', text: '' },
      { kind: 'added', text: 'tolerations:' },
      { kind: 'added', text: '  - key: workload-type' },
      { kind: 'added', text: '    operator: Equal' },
      { kind: 'added', text: '    value: gpu' },
      { kind: 'added', text: '    effect: NoSchedule' },
      { kind: 'existing', text: '' },
      { kind: 'existing', text: 'resources:' },
      { kind: 'existing', text: '  limits:' },
      { kind: 'existing', text: '    cpu: "1"' },
      { kind: 'existing', text: '    memory: "2Gi"' },
      { kind: 'added', text: '    nvidia.com/gpu: 1' },
    ],
    focusLineIndex: 15,
  },
  {
    type: 'terminal',
    start: 109.6,
    duration: 20.3,
    audioFile: 'beat6.wav',
    caption:
      "Applying it — and I'm watching the pod status, not just trusting that helm upgrade returning success means the deployment worked. It goes through a brief Pending while the scheduler places it, then Running. The Events in kubectl describe pod confirm it was actually scheduled onto the GPU pool, not just that the container started somewhere.",
    lines: [
      { kind: 'prompt', text: 'helm upgrade --install fraud-scoring-api ./chart -f values.yaml' },
      { kind: 'output', text: 'Release "fraud-scoring-api" has been upgraded.' },
      { kind: 'prompt', text: 'kubectl get pods -l app=fraud-scoring-api -w' },
      { kind: 'output', text: 'fraud-scoring-api-7f9d   0/1   Pending   0s' },
      { kind: 'output', text: 'fraud-scoring-api-7f9d   0/1   Running   4s' },
      { kind: 'output', text: 'fraud-scoring-api-7f9d   1/1   Running   31s' },
      { kind: 'prompt', text: 'kubectl describe pod fraud-scoring-api-7f9d | grep Scheduled' },
      { kind: 'output', text: 'Normal  Scheduled  Successfully assigned to gpu-node-01' },
    ],
    focusLineIndex: 7,
  },
  {
    type: 'terminal',
    start: 129.9,
    duration: 23.4,
    audioFile: 'beat7.wav',
    caption:
      "Running, and readiness probe passing — 1/1 Ready. It would be easy to stop here and call this done. But that only confirms the process started and is responding to a shallow health check. The real bar is a genuine inference request. I'm sending an actual scoring request and checking that the response is a real score, not an error wrapped in a 200, and not an empty body.",
    lines: [
      { kind: 'prompt', text: 'kubectl get pods -l app=fraud-scoring-api' },
      { kind: 'output', text: 'fraud-scoring-api-7f9d   1/1   Running   2m' },
      { kind: 'prompt', text: 'curl -X POST http://fraud-scoring-api/predict -d @tx.json' },
      { kind: 'output', text: '{"fraud_score": 0.032, "model_version": "2.3.0"}' },
    ],
    focusLineIndex: 3,
  },
  {
    type: 'recap',
    start: 153.3,
    duration: 18.4,
    audioFile: 'beat8.wav',
    caption:
      "Three things worth taking with you: read the actual taint off the node instead of assuming a common convention, confirm the GPU resource genuinely exists before your chart asks for it, and when you're deciding whether a deployment worked, a real response beats a green pod status every time.",
    items: [
      "Checked the node pool's real taint before writing a toleration — didn't assume a convention.",
      'Confirmed the device plugin was actually advertising GPUs before requesting one.',
      'Verified with a real inference response, not pod status alone.',
    ],
  },
];

export const TOTAL_DURATION_SECONDS = 171.7;
export const TOTAL_DURATION_FRAMES = Math.round(TOTAL_DURATION_SECONDS * FPS);
