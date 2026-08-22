// Source of truth: /experience-catalog/exp-inference-under-load/content/video-script.md
// If you edit the narration there, update the matching beat below (start/duration in seconds
// must stay in sync — see the "Production notes" section of that file).
export const FPS = 30;

export type DashboardPanel = {
  label: string;
  unit: string;
  color: string;
  points: number[]; // 0-100 scale, rendered left-to-right
  flat?: boolean;
};

export type TerminalLine = {
  kind: 'prompt' | 'output';
  text: string;
};

export type Beat =
  | {
      type: 'title';
      start: number;
      duration: number;
      title: string;
      subtitle: string;
      caption?: string;
    }
  | {
      type: 'dashboard';
      start: number;
      duration: number;
      caption: string;
      serviceName: string;
      alert?: string;
      panels: DashboardPanel[];
    }
  | {
      type: 'terminal';
      start: number;
      duration: number;
      caption: string;
      lines: TerminalLine[];
    }
  | {
      type: 'recap';
      start: number;
      duration: number;
      caption: string;
      items: string[];
    };

export const inferenceUnderLoadScript: Beat[] = [
  {
    type: 'title',
    start: 0,
    duration: 20,
    title: 'Watching an Expert Diagnose a GPU Saturation Incident',
    subtitle: 'A different service. A similar problem. Watch how the investigation actually happens.',
  },
  {
    type: 'dashboard',
    start: 20,
    duration: 90,
    serviceName: 'doc-search-summarizer',
    alert: 'P2 — Latency SLO burn rate elevated',
    caption:
      "It's 2:14pm. doc-search-summarizer just paged. p99 latency is climbing, and it's not alone — GPU utilization on its node pool is climbing too. Queue depth is climbing. Three things going up at once. Before touching anything, the question is: which of these is the cause, and which are just symptoms?",
    panels: [
      { label: 'p99 latency', unit: 'ms', color: '#f97066', points: [220, 230, 240, 260, 300, 360, 430, 520] },
      { label: 'GPU utilization', unit: '%', color: '#fb923c', points: [58, 61, 65, 70, 76, 82, 87, 91] },
      { label: 'Queue depth', unit: 'req', color: '#facc15', points: [4, 6, 9, 14, 20, 28, 37, 48] },
    ],
  },
  {
    type: 'dashboard',
    start: 110,
    duration: 90,
    serviceName: 'doc-search-summarizer',
    caption:
      "First check: GPU utilization, not queue depth, not latency. Here's why — GPU utilization tells you if the compute itself is the bottleneck. It's climbing toward 90%, and GPU memory is flat. That combination matters: if memory were also climbing, I'd suspect a batch-size or memory-leak problem. Flat memory plus rising utilization points at compute saturation — the GPU is doing as much work as it can, and it's running out of headroom.",
    panels: [
      { label: 'GPU utilization', unit: '%', color: '#fb923c', points: [58, 61, 65, 70, 76, 82, 87, 91] },
      { label: 'GPU memory', unit: '%', color: '#60a5fa', points: [44, 45, 44, 46, 45, 44, 45, 44], flat: true },
    ],
  },
  {
    type: 'dashboard',
    start: 200,
    duration: 70,
    serviceName: 'ingress / load balancer',
    caption:
      "Rising latency could also mean a network problem — a bad ingress config, a DNS issue, a load balancer having a bad day. Quick check of the ingress dashboard: request rate is flat, not spiking. Error rate is flat. Ingress-layer latency contribution is basically zero. That rules out the network as the cause. It's not what's sending the traffic — it's what's receiving it.",
    panels: [
      { label: 'Request rate', unit: 'req/s', color: '#60a5fa', points: [120, 118, 122, 119, 121, 120, 122, 121], flat: true },
      { label: '5xx error rate', unit: '%', color: '#a78bfa', points: [0.1, 0.1, 0.2, 0.1, 0.1, 0.1, 0.2, 0.1], flat: true },
      { label: 'Ingress latency contribution', unit: 'ms', color: '#34d399', points: [3, 3, 4, 3, 3, 3, 4, 3], flat: true },
    ],
  },
  {
    type: 'dashboard',
    start: 270,
    duration: 70,
    serviceName: 'doc-search-summarizer',
    caption:
      "One more check before deciding anything: is queue depth still climbing, or has it started to level off on its own? Widening the window — it's been climbing steadily for the last twenty minutes with no plateau. That matters. If it had leveled off, this might resolve itself. It hasn't. This needs an active decision, not a wait-and-see.",
    panels: [
      {
        label: 'Queue depth (20 min window)',
        unit: 'req',
        color: '#facc15',
        points: [2, 3, 4, 6, 9, 12, 14, 20, 24, 28, 33, 37, 41, 48],
      },
    ],
  },
  {
    type: 'terminal',
    start: 340,
    duration: 40,
    caption:
      "Checking whether autoscaling is even still working — kubectl get scaledobject. It's active, and it's already at its configured maximum: twelve out of twelve replicas. KEDA is doing its job. It's just already maxed out. That's a different problem than 'autoscaling is broken' — it's 'autoscaling is working, and the ceiling is too low for right now.'",
    lines: [
      { kind: 'prompt', text: 'kubectl get scaledobject doc-search-summarizer -n inference' },
      { kind: 'output', text: 'NAME                    READY   ACTIVE   MIN   MAX   TRIGGERS' },
      { kind: 'output', text: 'doc-search-summarizer   True    True     2     12    prometheus' },
      { kind: 'prompt', text: 'kubectl get deploy doc-search-summarizer -n inference' },
      { kind: 'output', text: 'NAME                    READY   UP-TO-DATE   AVAILABLE' },
      { kind: 'output', text: 'doc-search-summarizer   12/12   12           12' },
    ],
  },
  {
    type: 'terminal',
    start: 380,
    duration: 80,
    caption:
      "With the max replica ceiling already hit, scaling further isn't an option right now — that's a capacity conversation for after the incident. What I can do immediately is reduce demand. This service has a free tier and a paid tier. I'm applying a rate limit that cuts free-tier request volume by 40% for the next hour. That's the tradeoff, said out loud: free-tier users see more '429 - try again shortly' responses for a while, in exchange for paid-tier latency staying inside SLA. It's not free. It's a choice, and I'm making it deliberately, not by default.",
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
  {
    type: 'recap',
    start: 460,
    duration: 20,
    caption:
      'Three things worth taking with you: check the signal that actually tells you where the bottleneck is, rule out the tempting alternative explanation before committing, and when you mitigate, say the tradeoff out loud — don’t just apply a fix and hope nobody asks what it cost.',
    items: [
      'Checked GPU utilization + memory first — compute-bound, not memory-bound.',
      'Ruled out network using the ingress dashboard before assuming GPU.',
      'Chose a mitigation with a named tradeoff, not an unqualified fix.',
    ],
  },
];

export const TOTAL_DURATION_SECONDS = 480;
export const TOTAL_DURATION_FRAMES = TOTAL_DURATION_SECONDS * FPS;
