/**
 * Transport-agnostic router: maps (method, path) to service calls. The Lambda
 * handler adapts the API Gateway event to `RouteInput`; tests call `route()`
 * directly.
 */
import { errorResponse, json, notFound, parseJsonBody, type HttpResponse } from "./http.js";
import type { AlchemyService, Caller } from "./service.js";

export interface RouteInput {
  method: string;
  /** Path without stage prefix, e.g. "/experiences/aws-global-infrastructure". */
  path: string;
  query: Record<string, string | undefined>;
  body?: string | null;
  isBase64?: boolean;
  caller: Caller;
  requestId?: string;
}

type Handler = (svc: AlchemyService, params: string[], input: RouteInput) => Promise<{ status: number; body: unknown }>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const SEG = "([A-Za-z0-9._-]+)";
const num = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v));

const ROUTES: Route[] = [
  { method: "GET", pattern: /^\/health$/, handler: async () => ({ status: 200, body: { ok: true, service: "alchemy", time: new Date().toISOString() } }) },

  { method: "GET", pattern: /^\/experiences$/, handler: async (svc, _p, i) => ({ status: 200, body: await svc.listExperiences({ domain: i.query.domain, status: i.query.status, limit: num(i.query.limit), cursor: i.query.cursor }, i.caller) }) },
  { method: "POST", pattern: /^\/experiences$/, handler: async (svc, _p, i) => ({ status: 201, body: await svc.createExperience(parseJsonBody(i.body, i.isBase64), i.caller) }) },
  { method: "GET", pattern: new RegExp(`^/experiences/${SEG}$`), handler: async (svc, [id], i) => ({ status: 200, body: await svc.getExperience(id!, i.query.version, i.caller) }) },
  { method: "GET", pattern: new RegExp(`^/experiences/${SEG}/versions$`), handler: async (svc, [id], i) => ({ status: 200, body: await svc.listVersions(id!, i.caller) }) },
  { method: "POST", pattern: new RegExp(`^/experiences/${SEG}/versions$`), handler: async (svc, [id], i) => ({ status: 201, body: await svc.registerVersion(id!, parseJsonBody(i.body, i.isBase64), i.caller) }) },
  { method: "GET", pattern: new RegExp(`^/experiences/${SEG}/versions/${SEG}$`), handler: async (svc, [id, v], i) => ({ status: 200, body: await svc.getVersion(id!, v!, i.caller) }) },
  { method: "POST", pattern: new RegExp(`^/experiences/${SEG}/versions/${SEG}/status$`), handler: async (svc, [id, v], i) => ({ status: 200, body: await svc.setVersionStatus(id!, v!, parseJsonBody(i.body, i.isBase64), i.caller) }) },
  { method: "GET", pattern: new RegExp(`^/experiences/${SEG}/versions/${SEG}/artifacts/${SEG}/url$`), handler: async (svc, [id, v, a], i) => ({ status: 200, body: await svc.getArtifactUrl(id!, v!, a!, num(i.query.ttl), i.caller) }) },
  { method: "GET", pattern: new RegExp(`^/experiences/${SEG}/content$`), handler: async (svc, [id], i) => ({ status: 200, body: await svc.getContent(id!, i.query.version, num(i.query.ttl), i.caller) }) },

  { method: "GET", pattern: /^\/skills$/, handler: async (svc, _p, i) => ({ status: 200, body: await svc.listSkills({ domain: i.query.domain, limit: num(i.query.limit), cursor: i.query.cursor }) }) },
  { method: "GET", pattern: new RegExp(`^/skills/${SEG}$`), handler: async (svc, [id]) => ({ status: 200, body: await svc.getSkill(id!) }) },
  { method: "PUT", pattern: new RegExp(`^/skills/${SEG}$`), handler: async (svc, [id], i) => ({ status: 200, body: await svc.upsertSkill(id!, parseJsonBody(i.body, i.isBase64), i.caller) }) },
  { method: "GET", pattern: new RegExp(`^/skills/${SEG}/experiences$`), handler: async (svc, [id], i) => ({ status: 200, body: await svc.skillExperiences(id!, i.query.relation, i.caller) }) },

  { method: "POST", pattern: /^\/publish$/, handler: async (svc, _p, i) => ({ status: 200, body: await svc.publish(parseJsonBody(i.body, i.isBase64), i.caller) }) },
];

export async function route(svc: AlchemyService, input: RouteInput): Promise<HttpResponse> {
  const path = input.path.length > 1 && input.path.endsWith("/") ? input.path.slice(0, -1) : input.path;
  try {
    let pathMatched = false;
    for (const r of ROUTES) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== input.method.toUpperCase()) continue;
      const params = m.slice(1).map((s) => decodeURIComponent(s));
      const out = await r.handler(svc, params, input);
      return json(out.status, out.body);
    }
    if (pathMatched) return json(405, { error: { code: "bad_request", message: `method ${input.method} not allowed on ${path}` } });
    throw notFound(`route ${input.method} ${path}`);
  } catch (err) {
    return errorResponse(err, input.requestId);
  }
}
