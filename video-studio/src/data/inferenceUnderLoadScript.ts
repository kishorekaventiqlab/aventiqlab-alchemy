// Source of truth: /experience-catalog/exp-inference-under-load/content/video-script.md
// Narrative plan: /experience-catalog/exp-inference-under-load/content/video-narrative-plan.md
// (follows docs/video-artifact-constitution.md's reasoning spine - all ten stages
// treated as REQUIRED for this reference build).
// If you edit the narration there, regenerate audio with
// `npm run generate:audio -- inferenceUnderLoadScript` (Chatterbox V3, local/offline), then
// update this file's start/duration values to match each beat's new measured audio
// length + a ~3s buffer (see public/audio/inferenceUnderLoadScript/inferenceUnderLoadScript.manifest.json
// after regenerating).
export const FPS = 30;

export type DashboardPanel = {
  label: string;
  unit: string;
  color: string;
  points: number[];
  flat?: boolean;
};

export type TerminalLine = {
  kind: 'prompt' | 'output';
  text: string;
};

export type ArchNodeSpec = {
  kind:
    | 'users'
    | 'alb'
    | 'service'
    | 'pod'
    | 'gpu'
    | 'keda'
    | 'scheduler'
    | 'karpenter'
    | 'node';
  label: string;
  sublabel?: string;
  x: number;
  y: number;
};

export type ArchEdgeSpec = {
  fromIndex: number;
  toIndex: number;
  flowing?: boolean;
};

export type CompareOption = {
  name: string;
  solves: string;
  doesNotSolve?: string;
  favored?: boolean;
};

export type InvestigationNodeState = { id: string; label: string; fillPercent: number; full?: boolean; incoming?: boolean };

export type InvestigationKeyframe = {
  t: number; // seconds, relative to the investigation beat's own start
  traffic: number;
  podCount: number;
  gpuPct: number;
  queueDepth: number;
  nodes: InvestigationNodeState[];
  pendingPods: string[];
  resolvedPods: string[];
  trafficColor?: 'accent' | 'danger' | 'warning' | 'success';
  gpuColor?: 'accent' | 'danger' | 'warning' | 'success';
};

// One caption/audio segment within the continuous investigation beat - the
// narration still advances sentence by sentence, but the visuals underneath
// it no longer cut: they're all sampled from one shared keyframe timeline.
export type InvestigationSegment = {
  t: number; // seconds, relative to the investigation beat's own start
  caption: string;
  audioFile: string;
  highlightIndex?: number;
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
      // Problem / Stakes / Curiosity / Decision / Best Practice: one landed sentence.
      type: 'statement';
      start: number;
      duration: number;
      caption: string;
      eyebrow: string;
      eyebrowColor?: 'accent' | 'danger' | 'warning' | 'success';
      statement: string;
      support?: string;
      audioFile?: string;
    }
  | {
      // Options / Trade-offs: a 2-3 column comparison of named approaches.
      type: 'optionsCompare';
      start: number;
      duration: number;
      caption: string;
      options: CompareOption[];
      audioFile?: string;
    }
  | {
      // Context/Mental Model: shows the static component chain, highlighting one node at a time.
      type: 'architecture';
      start: number;
      duration: number;
      caption: string;
      nodes: ArchNodeSpec[];
      edges: ArchEdgeSpec[];
      highlightIndex?: number;
      audioFile?: string;
    }
  | {
      // Investigation/Demonstration: ONE continuous scene spanning the whole
      // traffic-climb -> KEDA-scales -> pending -> Karpenter -> recovery
      // story, driven by a shared keyframe timeline so numbers tween, pods
      // spawn/despawn as animated elements, and the camera can choreograph
      // across the story instead of cutting between static per-moment beats.
      type: 'investigation';
      start: number;
      duration: number;
      keyframes: InvestigationKeyframe[];
      segments: InvestigationSegment[];
    }
  | {
      type: 'dashboard';
      start: number;
      duration: number;
      caption: string;
      serviceName: string;
      alert?: string;
      panels: DashboardPanel[];
      audioFile?: string;
      focusPanelIndex?: number;
    }
  | {
      type: 'terminal';
      start: number;
      duration: number;
      caption: string;
      lines: TerminalLine[];
      audioFile?: string;
      focusLineIndex?: number;
    }
  | {
      type: 'recap';
      start: number;
      duration: number;
      caption: string;
      items: string[];
      audioFile?: string;
    };

// Shared architecture layout used across the Context/Mental Model beats (positions in a 1920x1080 frame).
export const ARCH_NODES: ArchNodeSpec[] = [
  { kind: 'users', label: 'Users', x: 220, y: 160 },
  { kind: 'alb', label: 'ALB', sublabel: 'ingress', x: 480, y: 160 },
  { kind: 'service', label: 'Service', sublabel: 'load-balances pods', x: 740, y: 160 },
  { kind: 'pod', label: 'Inference Pod', sublabel: 'vLLM', x: 1000, y: 160 },
  { kind: 'gpu', label: 'GPU', x: 1260, y: 160 },
  { kind: 'keda', label: 'KEDA', sublabel: 'controls replica count', x: 740, y: 420 },
  { kind: 'scheduler', label: 'Scheduler', sublabel: 'places pods on nodes', x: 1000, y: 420 },
  { kind: 'karpenter', label: 'Karpenter', sublabel: 'provisions node capacity', x: 1260, y: 420 },
];

export const ARCH_EDGES: ArchEdgeSpec[] = [
  { fromIndex: 0, toIndex: 1, flowing: true },
  { fromIndex: 1, toIndex: 2, flowing: true },
  { fromIndex: 2, toIndex: 3, flowing: true },
  { fromIndex: 3, toIndex: 4, flowing: true },
  { fromIndex: 5, toIndex: 3 },
  { fromIndex: 6, toIndex: 3 },
  { fromIndex: 7, toIndex: 6 },
];

export const inferenceUnderLoadScript: Beat[] = [
  {
    type: 'title',
    start: 0,
    duration: 7,
    title: 'Why Pod Autoscaling Can Still Leave You Stuck',
    subtitle: 'Why can pod autoscaling still fail when a GPU workload needs additional node capacity?',
  },

  // ===== STAGE 1: PROBLEM =====
  {
    type: 'statement',
    start: 7,
    duration: 11.3,
    audioFile: 'beat2.wav',
    eyebrow: 'The problem',
    eyebrowColor: 'danger',
    statement: 'Users of your GPU inference service are seeing slow responses.',
    support: 'Traffic climbed. Pods are scaling. Latency keeps getting worse anyway.',
    caption:
      "Your GPU inference service is falling behind. Traffic climbed a while ago, the pods have been scaling the whole time, and responses are still getting slower.",
  },

  // ===== STAGE 2: STAKES =====
  {
    type: 'statement',
    start: 18.3,
    duration: 14.9,
    audioFile: 'beat3.wav',
    eyebrow: 'What breaks if this stays broken',
    eyebrowColor: 'warning',
    statement: 'Queue depth grows → latency rises → requests start timing out → users see failures.',
    support: "This is a paid-tier feature. A sustained SLA breach isn't a metric — it's a contractual problem.",
    caption:
      "Here's why it matters. Queue depth keeps growing, latency keeps rising, and eventually requests start timing out — users just see failure. This is a paid-tier feature with a real SLA, so this isn't just an ugly graph.",
  },

  // ===== STAGE 3: CURIOSITY =====
  {
    type: 'statement',
    start: 33.2,
    duration: 10.9,
    audioFile: 'beat4.wav',
    eyebrow: 'The question',
    eyebrowColor: 'accent',
    statement: "CPU on these pods is sitting at 35%. So why are we falling behind?",
    caption:
      "Here's the confusing part. CPU on these pods is sitting at 35 percent — nowhere near maxed out. So why is the service still falling behind?",
  },

  // ===== STAGE 4: CONTEXT / MENTAL MODEL =====
  {
    type: 'architecture',
    start: 44.1,
    duration: 12.5,
    audioFile: 'beat5.wav',
    caption:
      "To answer that, let's look at what's actually inside the cluster. A request arrives through a load balancer, hits a Kubernetes Service, and gets forwarded to one of the inference pods.",
    nodes: ARCH_NODES,
    edges: ARCH_EDGES.filter((e) => e.toIndex <= 3),
  },
  {
    type: 'architecture',
    start: 56.6,
    duration: 11.6,
    audioFile: 'beat6.wav',
    caption:
      'Each pod runs the model-serving process, and that process runs on a GPU. This is where the actual inference happens — and where the real bottleneck usually lives.',
    nodes: ARCH_NODES,
    edges: ARCH_EDGES.filter((e) => e.toIndex <= 4),
    highlightIndex: 4,
  },
  {
    type: 'architecture',
    start: 68.2,
    duration: 12.7,
    audioFile: 'beat7.wav',
    caption:
      "So CPU was never the signal that mattered here. Something else controls how many pods we have — that's KEDA. And something else decides where those pods actually run — that's the scheduler.",
    nodes: ARCH_NODES,
    edges: [...ARCH_EDGES.filter((e) => e.toIndex <= 3), ARCH_EDGES[4], ARCH_EDGES[5]],
    highlightIndex: 5,
  },
  {
    type: 'architecture',
    start: 80.9,
    duration: 11.6,
    audioFile: 'beat8.wav',
    caption:
      "And one more piece: Karpenter. It provisions new node capacity when the cluster needs it. Keep these three separate in your head — that's the whole answer to why this can still break.",
    nodes: ARCH_NODES,
    edges: ARCH_EDGES,
    highlightIndex: 7,
  },

  // ===== STAGE 5: OPTIONS =====
  {
    type: 'optionsCompare',
    start: 92.5,
    duration: 12.3,
    audioFile: 'beat9.wav',
    caption:
      "Before going further — the obvious first instinct here is a CPU-based HPA. It's the default, well-known mechanism for pod autoscaling. So why isn't that the answer?",
    options: [
      {
        name: 'HPA (CPU-based)',
        solves: 'Scales replica count based on CPU utilization — the default, well-known mechanism.',
        doesNotSolve: "Doesn't reflect demand for this workload — CPU stays low even while the queue backs up.",
      },
    ],
  },

  // ===== STAGE 6: TRADE-OFFS =====
  {
    type: 'optionsCompare',
    start: 104.8,
    duration: 17.5,
    audioFile: 'beat10.wav',
    caption:
      "Here's the real three-way split. KEDA can react to queue depth instead of CPU — a better signal, but it still only controls replica count. Karpenter controls node capacity, but it has no opinion on how many replicas you need. Neither one does the other's job.",
    options: [
      {
        name: 'KEDA (queue-depth)',
        solves: 'Scales replica count from a signal that actually reflects demand for this workload.',
        doesNotSolve: 'Cannot create GPU node capacity — it only ever asks for more pods.',
        favored: true,
      },
      {
        name: 'Karpenter',
        solves: 'Provisions new GPU node capacity when the cluster is out of room.',
        doesNotSolve: 'Has no opinion on how many replicas the application needs.',
        favored: true,
      },
    ],
  },

  // ===== STAGE 7: INVESTIGATION / DEMONSTRATION =====
  // One continuous scene (see InvestigationScene.tsx) - all six of the old
  // discrete metrics/pending/karpenter beats are now sample points on a
  // single keyframe timeline, t=0 at this beat's own start (122.3s).
  {
    type: 'investigation',
    start: 122.3,
    duration: 83.7, // 122.3 -> 206.0, matching the six old beats' combined span exactly
    keyframes: [
      {
        t: 0,
        traffic: 100,
        podCount: 4,
        gpuPct: 45,
        queueDepth: 0,
        nodes: [
          { id: 'n1', label: 'GPU Node 1', fillPercent: 45 },
          { id: 'n2', label: 'GPU Node 2', fillPercent: 40 },
        ],
        pendingPods: [],
        resolvedPods: [],
      },
      {
        t: 12.5,
        traffic: 600,
        podCount: 8,
        gpuPct: 78,
        queueDepth: 6,
        trafficColor: 'warning',
        gpuColor: 'warning',
        nodes: [
          { id: 'n1', label: 'GPU Node 1', fillPercent: 74 },
          { id: 'n2', label: 'GPU Node 2', fillPercent: 70 },
        ],
        pendingPods: [],
        resolvedPods: [],
      },
      {
        t: 28.1,
        traffic: 950,
        podCount: 12,
        gpuPct: 96,
        queueDepth: 24,
        trafficColor: 'danger',
        gpuColor: 'danger',
        nodes: [
          { id: 'n1', label: 'GPU Node 1', fillPercent: 92 },
          { id: 'n2', label: 'GPU Node 2', fillPercent: 90 },
        ],
        pendingPods: [],
        resolvedPods: [],
      },
      {
        t: 42.3,
        traffic: 980,
        podCount: 14,
        gpuPct: 99,
        queueDepth: 44,
        trafficColor: 'danger',
        gpuColor: 'danger',
        nodes: [
          { id: 'n1', label: 'GPU Node 1', fillPercent: 100, full: true },
          { id: 'n2', label: 'GPU Node 2', fillPercent: 100, full: true },
        ],
        pendingPods: ['pod-13', 'pod-14'],
        resolvedPods: [],
      },
      {
        t: 56.9,
        traffic: 980,
        podCount: 14,
        gpuPct: 99,
        queueDepth: 44,
        trafficColor: 'danger',
        gpuColor: 'danger',
        nodes: [
          { id: 'n1', label: 'GPU Node 1', fillPercent: 100, full: true },
          { id: 'n2', label: 'GPU Node 2', fillPercent: 100, full: true },
          { id: 'n3', label: 'GPU Node 3', fillPercent: 40, incoming: true },
        ],
        pendingPods: [],
        resolvedPods: ['pod-13', 'pod-14'],
      },
      {
        t: 71.7,
        traffic: 640,
        podCount: 14,
        gpuPct: 74,
        queueDepth: 6,
        trafficColor: 'success',
        gpuColor: 'success',
        nodes: [
          { id: 'n1', label: 'GPU Node 1', fillPercent: 82 },
          { id: 'n2', label: 'GPU Node 2', fillPercent: 78 },
          { id: 'n3', label: 'GPU Node 3', fillPercent: 55 },
        ],
        pendingPods: [],
        resolvedPods: [],
      },
      {
        t: 83.7,
        traffic: 610,
        podCount: 14,
        gpuPct: 70,
        queueDepth: 3,
        trafficColor: 'success',
        gpuColor: 'success',
        nodes: [
          { id: 'n1', label: 'GPU Node 1', fillPercent: 80 },
          { id: 'n2', label: 'GPU Node 2', fillPercent: 76 },
          { id: 'n3', label: 'GPU Node 3', fillPercent: 58 },
        ],
        pendingPods: [],
        resolvedPods: [],
      },
    ],
    segments: [
      {
        t: 0,
        audioFile: 'beat11.wav',
        caption:
          "Here's the system running normally. A hundred requests a second, four pods, two nodes. GPU utilization is comfortable, and there's no queue. Nothing is under pressure.",
      },
      {
        t: 12.5,
        audioFile: 'beat12.wav',
        highlightIndex: 5,
        caption:
          'Now traffic starts climbing — 200, then 400, then 600 requests a second. GPU utilization is rising with it. And KEDA is doing exactly what it should: scaling the application layer to keep up.',
      },
      {
        t: 28.1,
        audioFile: 'beat13.wav',
        highlightIndex: 5,
        caption:
          'Traffic keeps climbing. GPU utilization, queue depth, and latency are all rising together now. KEDA keeps doing its job — creating more pods to meet demand: ten, then twelve replicas.',
      },
      {
        t: 42.3,
        audioFile: 'beat14.wav',
        caption:
          "And here's the moment that matters. Both GPU nodes are full. KEDA successfully created two more pods — but Kubernetes cannot place them, because there's no available GPU capacity left. They sit there, Pending. The queue keeps climbing right along with them.",
      },
      {
        t: 56.9,
        audioFile: 'beat15.wav',
        highlightIndex: 7,
        caption:
          "This is where Karpenter takes over. It sees pods that can't be scheduled because the cluster is out of room, and provisions a new GPU node sized to fit them. Once that node joins the cluster, the pending pods get scheduled.",
      },
      {
        t: 71.7,
        audioFile: 'beat16.wav',
        caption:
          'KEDA solved pod demand. Karpenter solved infrastructure capacity. With both pieces in place, queue depth and latency recover, and the system settles back to healthy.',
      },
    ],
  },

  // ===== STAGE 8: DECISION =====
  {
    type: 'statement',
    start: 206,
    duration: 17.9,
    audioFile: 'beat17.wav',
    eyebrow: 'The decision',
    eyebrowColor: 'accent',
    statement: 'Run KEDA and Karpenter together — not one instead of the other.',
    support: 'KEDA owns replica count because queue depth is the honest signal here. Karpenter owns node capacity, a completely different resource.',
    caption:
      "So the decision is this: KEDA owns replica count, because queue depth is the honest signal for this workload. Karpenter owns node capacity, because that's a completely different resource. Running both together — not one instead of the other — is what actually closes the gap.",
  },

  // ===== STAGE 9: BEST PRACTICE =====
  {
    type: 'statement',
    start: 223.9,
    duration: 11.5,
    audioFile: 'beat18.wav',
    eyebrow: 'Best practice',
    eyebrowColor: 'success',
    statement: 'Replicas increasing, pods still Pending? Check node capacity before tuning the scaler.',
    caption:
      "Here's the rule worth keeping. If replicas are increasing but pods remain Pending, don't tune the pod scaler harder — check node capacity and the scheduler first.",
  },

  // ===== STAGE 7 CONTINUED: EXPERT REASONING (existing content, reused) =====
  {
    type: 'dashboard',
    start: 235.4,
    duration: 16.9,
    audioFile: 'beat19.wav',
    serviceName: 'doc-search-summarizer',
    alert: 'P2 — Latency SLO burn rate elevated',
    caption:
      "Now let's watch how an experienced platform engineer investigates a similar production symptom. It's 2:14pm. doc-search-summarizer just paged — p99 latency, GPU utilization, and queue depth are all climbing at once.",
    panels: [
      { label: 'p99 latency', unit: 'ms', color: '#f97066', points: [220, 230, 240, 260, 300, 360, 430, 520] },
      { label: 'GPU utilization', unit: '%', color: '#fb923c', points: [58, 61, 65, 70, 76, 82, 87, 91] },
      { label: 'Queue depth', unit: 'req', color: '#facc15', points: [4, 6, 9, 14, 20, 28, 37, 48] },
    ],
  },
  {
    type: 'dashboard',
    start: 252.3,
    duration: 16.9,
    audioFile: 'beat20.wav',
    serviceName: 'doc-search-summarizer',
    caption:
      "First check: GPU utilization, not queue depth, not latency. It's climbing toward 90%, and GPU memory is flat. Flat memory plus rising utilization points at compute saturation — the GPU is doing as much work as it can.",
    panels: [
      { label: 'GPU utilization', unit: '%', color: '#fb923c', points: [58, 61, 65, 70, 76, 82, 87, 91] },
      { label: 'GPU memory', unit: '%', color: '#60a5fa', points: [44, 45, 44, 46, 45, 44, 45, 44], flat: true },
    ],
    focusPanelIndex: 0,
  },
  {
    type: 'dashboard',
    start: 269.2,
    duration: 16,
    audioFile: 'beat21.wav',
    serviceName: 'ingress / load balancer',
    caption:
      'Rising latency could also mean a network problem. Quick check of the ingress dashboard: request rate is flat, error rate is flat, ingress latency contribution is basically zero. That rules out the network as the cause.',
    panels: [
      { label: 'Request rate', unit: 'req/s', color: '#60a5fa', points: [120, 118, 122, 119, 121, 120, 122, 121], flat: true },
      { label: '5xx error rate', unit: '%', color: '#a78bfa', points: [0.1, 0.1, 0.2, 0.1, 0.1, 0.1, 0.2, 0.1], flat: true },
      { label: 'Ingress latency contribution', unit: 'ms', color: '#34d399', points: [3, 3, 4, 3, 3, 3, 4, 3], flat: true },
    ],
  },
  {
    type: 'terminal',
    start: 285.2,
    duration: 15.1,
    audioFile: 'beat22.wav',
    caption:
      "Checking whether autoscaling is even still working — kubectl get scaledobject. It's active, and it's already at its configured maximum: twelve out of twelve replicas. KEDA did its job. It's just already maxed out.",
    lines: [
      { kind: 'prompt', text: 'kubectl get scaledobject doc-search-summarizer -n inference' },
      { kind: 'output', text: 'NAME                    READY   ACTIVE   MIN   MAX   TRIGGERS' },
      { kind: 'output', text: 'doc-search-summarizer   True    True     2     12    prometheus' },
      { kind: 'prompt', text: 'kubectl get deploy doc-search-summarizer -n inference' },
      { kind: 'output', text: 'NAME                    READY   UP-TO-DATE   AVAILABLE' },
      { kind: 'output', text: 'doc-search-summarizer   12/12   12           12' },
    ],
    focusLineIndex: 5,
  },
  {
    type: 'terminal',
    start: 300.3,
    duration: 15.2,
    audioFile: 'beat23.wav',
    caption:
      "With the replica ceiling already hit and the node pool at capacity, scaling further isn't an option right now. What I can do immediately is reduce demand — a rate limit that cuts free-tier volume by 40% for the next hour.",
    lines: [
      { kind: 'prompt', text: 'vim gateway-rate-limits.yaml' },
      { kind: 'output', text: '+ tier: free-tier' },
      { kind: 'output', text: '+ action: reduce' },
      { kind: 'output', text: '+ reduction_percent: 40' },
      { kind: 'output', text: '+ duration: 1h' },
      { kind: 'prompt', text: 'kubectl apply -f gateway-rate-limits.yaml' },
      { kind: 'output', text: 'ratelimitpolicy.gateway.networking/free-tier-shed configured' },
    ],
  },

  // ===== STAGE 10: TAKEAWAY =====
  {
    type: 'recap',
    start: 315.5,
    duration: 13.5,
    audioFile: 'beat24.wav',
    caption:
      'Pod scaling and infrastructure scaling solve different problems. KEDA asks how many replicas we need. Karpenter asks whether we have the capacity to run them. The scheduler decides where they actually go.',
    items: [
      'KEDA — "How many application replicas do I need?"',
      'Karpenter — "Do I have enough compute capacity to run them?"',
      'Scheduler — "Where can these pods actually run?"',
    ],
  },
];

export const TOTAL_DURATION_SECONDS = 329;
export const TOTAL_DURATION_FRAMES = Math.round(TOTAL_DURATION_SECONDS * FPS);

// [startSeconds, endSeconds) windows, scene-relative to the whole video,
// covering every stretch where narration audio is playing - derived
// directly from the beat data (each beat's own start/duration window, or
// each Investigation segment's own start/duration) rather than from a
// separately-measured clip length, so this stays correct automatically if
// beat timing is ever retimed for a different engine's audio. Used by
// BackgroundMusic to duck the music bed under narration and let it rise
// during silent stretches (the title card, and any other narration-free
// gaps a future beat might introduce).
export const NARRATION_INTERVALS: { startSeconds: number; endSeconds: number }[] = (() => {
  const intervals: { startSeconds: number; endSeconds: number }[] = [];
  for (const beat of inferenceUnderLoadScript) {
    if (beat.type === 'investigation') {
      for (let i = 0; i < beat.segments.length; i++) {
        const seg = beat.segments[i];
        const nextT = beat.segments[i + 1]?.t ?? beat.duration;
        intervals.push({ startSeconds: beat.start + seg.t, endSeconds: beat.start + nextT });
      }
    } else if ('audioFile' in beat && beat.audioFile) {
      intervals.push({ startSeconds: beat.start, endSeconds: beat.start + beat.duration });
    }
  }
  return intervals;
})();
