/**
 * Alchemy business logic. Depends only on the storage ports, so every rule
 * here is exercised in tests against in-memory fakes.
 */
import {
  artifactItems,
  artifactUrlPath,
  assertTransition,
  compareSemver,
  ddb,
  experienceMetaItem,
  isImmutable,
  isSemver,
  LifecycleError,
  manifestKey,
  publicationItem,
  referencedSkillIds,
  skillEdgeItems,
  skillItem,
  toArtifactRef,
  toExperienceSummary,
  toVersionSummary,
  validateManifest,
  validateSkill,
  versionItem,
  versionPrefix,
  VERSION_STATUSES,
  type ArtifactItem,
  type ArtifactUrlResponse,
  type BaseItem,
  type ContentResponse,
  type CreateExperienceRequest,
  type ExperienceMetaItem,
  type ExperienceResponse,
  type ListExperiencesResponse,
  type ListSkillsResponse,
  type ListVersionsResponse,
  type Manifest,
  type PublishRequest,
  type PublishResponse,
  type RegisterVersionRequest,
  type RegisterVersionResponse,
  type SetVersionStatusRequest,
  type SignedArtifact,
  type SkillEdgeItem,
  type SkillExperiencesResponse,
  type SkillItem,
  type SkillResponse,
  type UploadTarget,
  type VersionDetail,
  type VersionItem,
  type VersionStatus,
} from "@aventiqlab/alchemy-core";
import type { ApiConfig } from "./config.js";
import { ApiError, badRequest, conflict, forbidden, notFound, validationFailed } from "./http.js";
import { ConflictError, systemClock, type Clock, type ContentStore, type ObjectStore } from "./ports.js";

export type Scope = "read" | "publish";

export interface Caller {
  scope: Scope;
  /** Opaque label recorded in publication history (e.g. token name). */
  actor: string;
}

interface Bundle {
  version: VersionItem;
  artifacts: ArtifactItem[];
  edges: SkillEdgeItem[];
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class AlchemyService {
  constructor(
    private readonly store: ContentStore,
    private readonly objects: ObjectStore,
    private readonly config: Pick<ApiConfig, "signedUrlTtlSec" | "uploadUrlTtlSec" | "verifyHashMaxBytes">,
    private readonly clock: Clock = systemClock,
  ) {}

  /* ------------------------------------------------------------ helpers */

  private assertSlug(value: string, what: string): void {
    if (!SLUG.test(value)) throw badRequest(`invalid ${what}: "${value}"`);
  }

  private assertVersion(value: string): void {
    if (!isSemver(value)) throw badRequest(`invalid version: "${value}" (expected MAJOR.MINOR.PATCH)`);
  }

  private async meta(experienceId: string): Promise<ExperienceMetaItem | null> {
    return this.store.get<ExperienceMetaItem>({ PK: ddb.experiencePk(experienceId), SK: ddb.metaSk() });
  }

  private async bundle(experienceId: string, version: string): Promise<Bundle | null> {
    const rows = await this.store.query<BaseItem>(ddb.experiencePk(experienceId), ddb.versionSk(version));
    const v = rows.find((r) => r.entityType === "EXPERIENCE_VERSION") as VersionItem | undefined;
    if (!v) return null;
    return {
      version: v,
      artifacts: rows.filter((r) => r.entityType === "ARTIFACT") as ArtifactItem[],
      edges: rows.filter((r) => r.entityType === "EXPERIENCE_SKILL") as SkillEdgeItem[],
    };
  }

  private async requireBundle(experienceId: string, version: string): Promise<Bundle> {
    this.assertSlug(experienceId, "experienceId");
    this.assertVersion(version);
    const b = await this.bundle(experienceId, version);
    if (!b) throw notFound(`version ${experienceId}@${version}`);
    return b;
  }

  private async missingSkills(m: Manifest): Promise<string[]> {
    const ids = referencedSkillIds(m);
    const found = await Promise.all(ids.map((id) => this.store.get<SkillItem>({ PK: ddb.skillPk(id), SK: ddb.metaSk() })));
    return ids.filter((_, i) => !found[i]);
  }

  private detail(b: Bundle): VersionDetail {
    return {
      ...toVersionSummary(b.version),
      manifest: b.version.manifest,
      artifacts: b.artifacts.map(toArtifactRef).sort((a, c) => a.artifactId.localeCompare(c.artifactId)),
      statusHistory: b.version.statusHistory,
    };
  }

  /** Readers only ever see published versions; publishers may preview drafts. */
  private assertVisible(v: VersionItem, caller: Caller): void {
    if (v.status !== "PUBLISHED" && caller.scope !== "publish") throw notFound(`version ${v.experienceId}@${v.version}`);
  }

  private expiresAt(ttlSec: number): string {
    return new Date(Date.parse(this.clock.now()) + ttlSec * 1000).toISOString();
  }

  /* ---------------------------------------------------------- read side */

  async listExperiences(q: { domain?: string; status?: string; limit?: number; cursor?: string }, caller: Caller): Promise<ListExperiencesResponse> {
    if (q.domain) this.assertSlug(q.domain, "domain");
    const limit = Math.min(100, Math.max(1, q.limit ?? 50));
    const page = await this.store.queryIndex<ExperienceMetaItem>("GSI1", ddb.gsi1ExperiencePk(), {
      skPrefix: q.domain ? `${q.domain}#` : undefined,
      limit,
      cursor: q.cursor,
    });
    let items = page.items;
    // Readers see only experiences with something published.
    if (caller.scope !== "publish") items = items.filter((i) => i.latestPublishedVersion !== null);
    if (q.status) items = items.filter((i) => i.status === q.status);
    return { items: items.map(toExperienceSummary), nextCursor: page.cursor };
  }

  async getExperience(experienceId: string, requestedVersion: string | undefined, caller: Caller): Promise<ExperienceResponse> {
    this.assertSlug(experienceId, "experienceId");
    const meta = await this.meta(experienceId);
    if (!meta) throw notFound(`experience ${experienceId}`);
    if (caller.scope !== "publish" && !meta.latestPublishedVersion) throw notFound(`experience ${experienceId}`);

    let version: VersionDetail | null = null;
    const target = requestedVersion ?? meta.latestPublishedVersion ?? undefined;
    if (target) {
      const b = await this.requireBundle(experienceId, target);
      this.assertVisible(b.version, caller);
      version = this.detail(b);
    }
    const base = `/experiences/${experienceId}`;
    return {
      experience: toExperienceSummary(meta),
      version,
      links: { self: base, versions: `${base}/versions`, content: version ? `${base}/content?version=${version.version}` : null },
    };
  }

  async listVersions(experienceId: string, caller: Caller): Promise<ListVersionsResponse> {
    this.assertSlug(experienceId, "experienceId");
    const meta = await this.meta(experienceId);
    if (!meta) throw notFound(`experience ${experienceId}`);
    const rows = await this.store.query<BaseItem>(ddb.experiencePk(experienceId), "VER#");
    let versions = rows.filter((r) => r.entityType === "EXPERIENCE_VERSION") as VersionItem[];
    if (caller.scope !== "publish") versions = versions.filter((v) => v.status === "PUBLISHED");
    if (caller.scope !== "publish" && versions.length === 0) throw notFound(`experience ${experienceId}`);
    return { experienceId, items: versions.map(toVersionSummary) };
  }

  async getVersion(experienceId: string, version: string, caller: Caller): Promise<VersionDetail> {
    const b = await this.requireBundle(experienceId, version);
    this.assertVisible(b.version, caller);
    return this.detail(b);
  }

  private async sign(a: ArtifactItem, ttlSec: number): Promise<SignedArtifact> {
    const url = await this.objects.presignGet(a.s3Key, ttlSec, a.contentType);
    return { ...toArtifactRef(a), url, expiresAt: this.expiresAt(ttlSec) };
  }

  async getContent(experienceId: string, requestedVersion: string | undefined, ttlSec: number | undefined, caller: Caller): Promise<ContentResponse> {
    this.assertSlug(experienceId, "experienceId");
    const meta = await this.meta(experienceId);
    if (!meta) throw notFound(`experience ${experienceId}`);
    const target = requestedVersion ?? meta.latestPublishedVersion;
    if (!target) throw notFound(`published version of ${experienceId}`);
    const b = await this.requireBundle(experienceId, target);
    this.assertVisible(b.version, caller);
    const ttl = Math.min(this.config.signedUrlTtlSec, Math.max(60, ttlSec ?? this.config.signedUrlTtlSec));
    const artifacts = await Promise.all(b.artifacts.sort((x, y) => x.artifactId.localeCompare(y.artifactId)).map((a) => this.sign(a, ttl)));
    return {
      experienceId,
      version: b.version.version,
      status: b.version.status,
      manifest: b.version.manifest,
      artifacts,
      expiresAt: this.expiresAt(ttl),
    };
  }

  async getArtifactUrl(experienceId: string, version: string, artifactId: string, ttlSec: number | undefined, caller: Caller): Promise<ArtifactUrlResponse> {
    this.assertSlug(artifactId, "artifactId");
    const b = await this.requireBundle(experienceId, version);
    this.assertVisible(b.version, caller);
    const a = b.artifacts.find((x) => x.artifactId === artifactId);
    if (!a) throw notFound(`artifact ${artifactId}`);
    const ttl = Math.min(this.config.signedUrlTtlSec, Math.max(60, ttlSec ?? this.config.signedUrlTtlSec));
    return { experienceId, version, artifact: await this.sign(a, ttl) };
  }

  /* -------------------------------------------------------------- skills */

  async listSkills(q: { domain?: string; limit?: number; cursor?: string }): Promise<ListSkillsResponse> {
    if (q.domain) this.assertSlug(q.domain, "domain");
    const page = await this.store.queryIndex<SkillItem>("GSI1", ddb.gsi1SkillPk(), {
      skPrefix: q.domain ? `${q.domain}#` : undefined,
      limit: Math.min(200, Math.max(1, q.limit ?? 100)),
      cursor: q.cursor,
    });
    return { items: page.items.map((i) => ({ ...i.skill, updatedAt: i.updatedAt })), nextCursor: page.cursor };
  }

  async getSkill(skillId: string): Promise<SkillResponse> {
    this.assertSlug(skillId, "skillId");
    const s = await this.store.get<SkillItem>({ PK: ddb.skillPk(skillId), SK: ddb.metaSk() });
    if (!s) throw notFound(`skill ${skillId}`);
    return { skill: s.skill, updatedAt: s.updatedAt };
  }

  async upsertSkill(skillId: string, body: unknown, caller: Caller): Promise<SkillResponse> {
    this.requirePublish(caller);
    this.assertSlug(skillId, "skillId");
    const r = validateSkill(body);
    if (!r.ok || !r.skill) throw validationFailed("skill failed validation", r.issues);
    if (r.skill.skillId !== skillId) throw badRequest(`skillId in path ("${skillId}") and body ("${r.skill.skillId}") differ`);
    const existing = await this.store.get<SkillItem>({ PK: ddb.skillPk(skillId), SK: ddb.metaSk() });
    const now = this.clock.now();
    const item = skillItem(r.skill, now, existing?.createdAt);
    await this.store.batchPut([item]);
    return { skill: item.skill, updatedAt: item.updatedAt };
  }

  /** "Which experiences teach / assess / require this skill?" — the future ASTRA query. */
  async skillExperiences(skillId: string, relation: string | undefined, caller: Caller): Promise<SkillExperiencesResponse> {
    this.assertSlug(skillId, "skillId");
    if (relation && !["TAUGHT", "ASSESSED", "REQUIRED"].includes(relation)) throw badRequest("relation must be TAUGHT | ASSESSED | REQUIRED");
    const page = await this.store.queryIndex<SkillEdgeItem>("GSI2", ddb.gsi2SkillEdgePk(skillId), {
      skPrefix: relation ? `${relation}#` : undefined,
      limit: 500,
    });
    let edges = page.items;
    if (caller.scope !== "publish") edges = edges.filter((e) => e.versionStatus === "PUBLISHED");
    return {
      skillId,
      items: edges.map((e) => ({ experienceId: e.experienceId, version: e.version, relation: e.relation, level: e.level, versionStatus: e.versionStatus })),
    };
  }

  /* ---------------------------------------------------------- publishing */

  private requirePublish(caller: Caller): void {
    if (caller.scope !== "publish") throw forbidden("publish scope required");
  }

  async createExperience(body: unknown, caller: Caller): Promise<ExperienceResponse> {
    this.requirePublish(caller);
    const b = body as Partial<CreateExperienceRequest> | null;
    if (!b || typeof b !== "object") throw badRequest("body must be an object");
    for (const f of ["experienceId", "title", "summary", "domain", "category", "level"] as const) {
      if (typeof b[f] !== "string" || !b[f]) throw badRequest(`${f} is required`);
    }
    const req = b as CreateExperienceRequest;
    this.assertSlug(req.experienceId, "experienceId");
    this.assertSlug(req.domain, "domain");
    this.assertSlug(req.category, "category");
    if (!["FOUNDATION", "INTERMEDIATE", "ADVANCED", "EXPERT"].includes(req.level)) throw badRequest("invalid level");
    if (!Number.isInteger(req.difficulty) || req.difficulty < 1 || req.difficulty > 5) throw badRequest("difficulty must be 1..5");

    const existing = await this.meta(req.experienceId);
    if (existing?.latestPublishedVersion) {
      throw conflict(`experience ${req.experienceId} has published versions; identity fields are refreshed from the manifest on publish, not edited directly`);
    }
    const now = this.clock.now();
    const item = experienceMetaItem(
      { ...req, tags: req.tags ?? [] },
      {
        status: existing?.status ?? "DRAFT",
        latestVersion: existing?.latestVersion ?? null,
        latestPublishedVersion: existing?.latestPublishedVersion ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
    );
    await this.store.batchPut([item]);
    return this.getExperience(req.experienceId, undefined, caller);
  }

  async registerVersion(experienceId: string, body: unknown, caller: Caller): Promise<RegisterVersionResponse> {
    this.requirePublish(caller);
    this.assertSlug(experienceId, "experienceId");
    const req = body as Partial<RegisterVersionRequest> | null;
    if (!req || typeof req !== "object" || !req.manifest) throw badRequest("body.manifest is required");

    const mv = validateManifest(req.manifest);
    if (!mv.ok || !mv.manifest) throw validationFailed("manifest failed validation", mv.issues);
    const m = mv.manifest;
    if (m.experienceId !== experienceId) throw badRequest(`experienceId in path ("${experienceId}") and manifest ("${m.experienceId}") differ`);

    // digests must cover exactly the manifest's artifacts
    const digests = Array.isArray(req.artifacts) ? req.artifacts : [];
    const wanted = new Set(m.artifacts.map((a) => a.artifactId));
    const seen = new Set<string>();
    const digestIssues: string[] = [];
    for (const d of digests) {
      if (!d || typeof d.artifactId !== "string") {
        digestIssues.push("artifact digest missing artifactId");
        continue;
      }
      if (!wanted.has(d.artifactId)) digestIssues.push(`digest for unknown artifact "${d.artifactId}"`);
      if (seen.has(d.artifactId)) digestIssues.push(`duplicate digest for "${d.artifactId}"`);
      seen.add(d.artifactId);
      if (!/^[a-f0-9]{64}$/.test(d.sha256 ?? "")) digestIssues.push(`"${d.artifactId}": sha256 must be 64 hex chars`);
      if (!Number.isInteger(d.sizeBytes) || d.sizeBytes <= 0) digestIssues.push(`"${d.artifactId}": sizeBytes must be a positive integer`);
    }
    for (const id of wanted) if (!seen.has(id)) digestIssues.push(`missing digest for artifact "${id}"`);
    const md = req.manifestDigest;
    if (!md || !/^[a-f0-9]{64}$/.test(md.sha256 ?? "") || !Number.isInteger(md.sizeBytes) || md.sizeBytes <= 0) digestIssues.push("manifestDigest {sha256, sizeBytes} is required");
    if (digestIssues.length) throw validationFailed("artifact digests are inconsistent with the manifest", digestIssues);

    const missing = await this.missingSkills(m);
    if (missing.length) throw new ApiError(422, "unknown_skill", "manifest references skills that do not exist in Alchemy; publish them first (PUT /skills/{skillId})", missing);

    const meta = await this.meta(experienceId);
    if (meta?.latestPublishedVersion && compareSemver(m.version, meta.latestPublishedVersion) <= 0) {
      throw conflict(`version ${m.version} is not greater than the latest published version ${meta.latestPublishedVersion}`);
    }
    const existing = await this.bundle(experienceId, m.version);
    if (existing && isImmutable(existing.version.status)) {
      throw new ApiError(409, "immutable_version", `version ${m.version} is ${existing.version.status} and cannot be changed; bump the version`);
    }

    const now = this.clock.now();
    const prefix = versionPrefix(m.domain, m.level, experienceId, m.version);
    const vItem = versionItem(m, {
      s3Prefix: prefix,
      manifestSha256: md!.sha256,
      manifestSizeBytes: md!.sizeBytes,
      now,
      actor: caller.actor,
      existing: existing?.version,
    });
    const aItems = artifactItems(m, digests, prefix, now);
    const eItems = skillEdgeItems(m, vItem.status, now);

    // A re-registered draft may have dropped artifacts/skills — remove stale rows.
    const keep = new Set([...aItems, ...eItems].map((i) => i.SK));
    const stale = [...(existing?.artifacts ?? []), ...(existing?.edges ?? [])].filter((i) => !keep.has(i.SK)).map((i) => ({ PK: i.PK, SK: i.SK }));
    if (stale.length) await this.store.batchDelete(stale);

    const metaItem = experienceMetaItem(m, {
      status: meta?.status ?? "DRAFT",
      latestVersion: !meta?.latestVersion || compareSemver(m.version, meta.latestVersion) > 0 ? m.version : meta.latestVersion,
      latestPublishedVersion: meta?.latestPublishedVersion ?? null,
      createdAt: meta?.createdAt ?? now,
      updatedAt: now,
    });
    // Keep published identity stable: only refresh catalog fields from a draft when nothing is published yet.
    const metaToWrite = meta?.latestPublishedVersion ? { ...meta, latestVersion: metaItem.latestVersion, updatedAt: now } : metaItem;

    await this.store.batchPut([vItem, ...aItems, ...eItems, metaToWrite]);

    const ttl = this.config.uploadUrlTtlSec;
    const uploads: UploadTarget[] = [];
    const manifestTarget = await this.objects.presignPut(manifestKey(prefix), "application/json", ttl);
    uploads.push({ artifactId: "manifest", key: manifestKey(prefix), method: "PUT", url: manifestTarget.url, headers: manifestTarget.headers, expiresAt: this.expiresAt(ttl) });
    for (const a of aItems) {
      const t = await this.objects.presignPut(a.s3Key, a.contentType, ttl);
      uploads.push({ artifactId: a.artifactId, key: a.s3Key, method: "PUT", url: t.url, headers: t.headers, expiresAt: this.expiresAt(ttl) });
    }
    return { experienceId, version: m.version, status: vItem.status, s3Prefix: prefix, uploads };
  }

  async publish(body: unknown, caller: Caller): Promise<PublishResponse> {
    this.requirePublish(caller);
    const req = body as Partial<PublishRequest> | null;
    if (!req || typeof req.experienceId !== "string" || typeof req.version !== "string") throw badRequest("experienceId and version are required");
    const b = await this.requireBundle(req.experienceId, req.version);
    const v = b.version;
    if (v.status === "PUBLISHED") throw new ApiError(409, "immutable_version", `version ${v.version} is already published`);
    try {
      assertTransition(v.status, "PUBLISHED");
    } catch (e) {
      if (e instanceof LifecycleError) throw conflict(e.message);
      throw e;
    }
    const meta = await this.meta(req.experienceId);
    if (meta?.latestPublishedVersion && compareSemver(v.version, meta.latestPublishedVersion) <= 0) {
      throw conflict(`version ${v.version} is not greater than the latest published version ${meta.latestPublishedVersion}`);
    }
    const missing = await this.missingSkills(v.manifest);
    if (missing.length) throw new ApiError(422, "unknown_skill", "manifest references skills that do not exist in Alchemy", missing);

    // Verify every uploaded object against the digests registered earlier.
    const problems: { artifactId: string; problem: string }[] = [];
    const mKey = manifestKey(v.s3Prefix);
    const mHead = await this.objects.head(mKey);
    if (!mHead) problems.push({ artifactId: "manifest", problem: "manifest.json not uploaded" });
    else if (mHead.sizeBytes !== v.manifestSizeBytes) problems.push({ artifactId: "manifest", problem: `size ${mHead.sizeBytes} != registered ${v.manifestSizeBytes}` });
    else if ((await this.objects.sha256(mKey)) !== v.manifestSha256) problems.push({ artifactId: "manifest", problem: "sha256 mismatch" });

    const now = this.clock.now();
    const verified: PublishResponse["verified"] = [];
    let totalBytes = 0;
    const verifiedArtifacts: ArtifactItem[] = [];
    for (const a of b.artifacts) {
      const head = await this.objects.head(a.s3Key);
      if (!head) {
        problems.push({ artifactId: a.artifactId, problem: "not uploaded" });
        continue;
      }
      if (head.sizeBytes !== a.sizeBytes) {
        problems.push({ artifactId: a.artifactId, problem: `size ${head.sizeBytes} != registered ${a.sizeBytes}` });
        continue;
      }
      let sha256Verified = false;
      if (a.sizeBytes <= this.config.verifyHashMaxBytes) {
        const actual = await this.objects.sha256(a.s3Key);
        if (actual !== a.sha256) {
          problems.push({ artifactId: a.artifactId, problem: "sha256 mismatch" });
          continue;
        }
        sha256Verified = true;
      }
      totalBytes += a.sizeBytes;
      verified.push({ artifactId: a.artifactId, sizeBytes: a.sizeBytes, sha256Verified });
      verifiedArtifacts.push({ ...a, verifiedAt: now, sha256Verified, etag: head.etag, updatedAt: now });
    }
    if (problems.length) throw new ApiError(409, "artifacts_not_ready", "one or more uploads are missing or do not match their registered digest", problems);

    const publishedVersion: VersionItem = {
      ...v,
      status: "PUBLISHED",
      publishedAt: now,
      updatedAt: now,
      statusHistory: [...v.statusHistory, { from: v.status, to: "PUBLISHED", at: now, actor: caller.actor }],
    };
    const edges = skillEdgeItems(v.manifest, "PUBLISHED", now);
    const newMeta = experienceMetaItem(v.manifest, {
      status: "PUBLISHED",
      latestVersion: !meta?.latestVersion || compareSemver(v.version, meta.latestVersion) > 0 ? v.version : meta.latestVersion,
      latestPublishedVersion: v.version,
      createdAt: meta?.createdAt ?? now,
      updatedAt: now,
    });
    const pub = publicationItem({
      experienceId: v.experienceId,
      version: v.version,
      from: v.status,
      to: "PUBLISHED",
      actor: caller.actor,
      now,
      artifactCount: verifiedArtifacts.length,
      totalBytes,
    });

    // Idempotent rows first, then the atomic status flip guarded on the pre-publish status.
    await this.store.batchPut([...verifiedArtifacts, ...edges]);
    try {
      await this.store.transactPut([publishedVersion, newMeta, pub], [{ PK: v.PK, SK: v.SK, expectedStatus: v.status }]);
    } catch (e) {
      if (e instanceof ConflictError) throw conflict("version changed while publishing; retry");
      throw e;
    }
    await this.objects.putJson(`${v.s3Prefix}_publication.json`, {
      experienceId: v.experienceId,
      version: v.version,
      publishedAt: now,
      actor: caller.actor,
      manifestSha256: v.manifestSha256,
      artifacts: verifiedArtifacts.map((a) => ({ artifactId: a.artifactId, path: a.path, sizeBytes: a.sizeBytes, sha256: a.sha256, sha256Verified: a.sha256Verified })),
    });

    return {
      experienceId: v.experienceId,
      version: v.version,
      status: "PUBLISHED",
      publishedAt: now,
      s3Prefix: v.s3Prefix,
      artifactCount: verifiedArtifacts.length,
      totalBytes,
      verified,
      previousPublishedVersion: meta?.latestPublishedVersion ?? null,
    };
  }

  async setVersionStatus(experienceId: string, version: string, body: unknown, caller: Caller): Promise<VersionDetail> {
    this.requirePublish(caller);
    const req = body as Partial<SetVersionStatusRequest> | null;
    const requested = req?.status as VersionStatus | undefined;
    if (!requested || !VERSION_STATUSES.includes(requested)) throw badRequest(`status must be one of ${VERSION_STATUSES.join(" | ")}`);
    if (requested === "PUBLISHED") throw badRequest("use POST /publish to publish; it verifies uploads first");
    const to: Exclude<VersionStatus, "PUBLISHED"> = requested;
    const b = await this.requireBundle(experienceId, version);
    const v = b.version;
    try {
      assertTransition(v.status, to);
    } catch (e) {
      if (e instanceof LifecycleError) throw conflict(e.message);
      throw e;
    }
    const now = this.clock.now();
    const entry: VersionItem["statusHistory"][number] = { from: v.status, to, at: now, actor: caller.actor };
    if (req?.note) entry.note = req.note;
    const updated: VersionItem = { ...v, status: to, updatedAt: now, statusHistory: [...v.statusHistory, entry] };
    const edges = b.edges.map((e) => ({ ...e, versionStatus: to, updatedAt: now }));
    const items: BaseItem[] = [updated, ...edges, publicationItem({ experienceId, version, from: v.status, to, actor: caller.actor, now, note: req?.note })];

    // Archiving the latest published version rolls the pointer back to the newest remaining published one.
    if (to === "ARCHIVED") {
      const meta = await this.meta(experienceId);
      if (meta && meta.latestPublishedVersion === version) {
        const rows = await this.store.query<BaseItem>(ddb.experiencePk(experienceId), "VER#");
        const remaining = (rows.filter((r) => r.entityType === "EXPERIENCE_VERSION") as VersionItem[])
          .filter((x) => x.status === "PUBLISHED" && x.version !== version)
          .sort((x, y) => compareSemver(y.version, x.version));
        const next = remaining[0]?.version ?? null;
        const rolled: ExperienceMetaItem = { ...meta, latestPublishedVersion: next, status: next ? "PUBLISHED" : "ARCHIVED", updatedAt: now };
        items.push(rolled);
      }
    }
    try {
      await this.store.transactPut(items, [{ PK: v.PK, SK: v.SK, expectedStatus: v.status }]);
    } catch (e) {
      if (e instanceof ConflictError) throw conflict("version changed concurrently; retry");
      throw e;
    }
    const fresh = await this.requireBundle(experienceId, version);
    return this.detail(fresh);
  }
}

export { artifactUrlPath };
