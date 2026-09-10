/**
 * In-memory ContentStore + ObjectStore. Used by tests and by the CLI's
 * local end-to-end harness. Mirrors DynamoDB semantics closely enough:
 * PK/SK equality, begins_with on SK, GSI projection, conditional transactions.
 */
import { createHash } from "node:crypto";
import type { BaseItem } from "@aventiqlab/alchemy-core";
import { ConflictError, type ContentStore, type Key, type ObjectHead, type ObjectStore, type Page, type StatusGuard } from "./ports.js";

const k = (key: Key) => `${key.PK} ${key.SK}`;

export class FakeContentStore implements ContentStore {
  readonly items = new Map<string, BaseItem>();

  async get<T extends BaseItem>(key: Key): Promise<T | null> {
    return (this.items.get(k(key)) as T | undefined) ?? null;
  }

  async query<T extends BaseItem>(pk: string, skPrefix = ""): Promise<T[]> {
    return [...this.items.values()]
      .filter((i) => i.PK === pk && i.SK.startsWith(skPrefix))
      .sort((a, b) => a.SK.localeCompare(b.SK)) as T[];
  }

  async queryIndex<T extends BaseItem>(
    index: "GSI1" | "GSI2",
    pk: string,
    opts: { skPrefix?: string; limit?: number; cursor?: string } = {},
  ): Promise<Page<T>> {
    const pkAttr = index === "GSI1" ? "GSI1PK" : "GSI2PK";
    const skAttr = index === "GSI1" ? "GSI1SK" : "GSI2SK";
    const all = [...this.items.values()]
      .filter((i) => i[pkAttr] === pk && (i[skAttr] ?? "").startsWith(opts.skPrefix ?? ""))
      .sort((a, b) => (a[skAttr] ?? "").localeCompare(b[skAttr] ?? "")) as T[];
    const start = opts.cursor ? Number(opts.cursor) : 0;
    const limit = opts.limit ?? 50;
    const items = all.slice(start, start + limit);
    const next = start + limit < all.length ? String(start + limit) : null;
    return { items, cursor: next };
  }

  async batchPut(items: BaseItem[]): Promise<void> {
    for (const i of items) this.items.set(k(i), structuredClone(i));
  }

  async batchDelete(keys: Key[]): Promise<void> {
    for (const key of keys) this.items.delete(k(key));
  }

  async transactPut(items: BaseItem[], guards: StatusGuard[] = []): Promise<void> {
    for (const g of guards) {
      const existing = this.items.get(k(g)) as (BaseItem & { status?: string }) | undefined;
      if (!existing || existing.status !== g.expectedStatus) throw new ConflictError(`guard failed for ${g.SK}`);
    }
    await this.batchPut(items);
  }
}

export class FakeObjectStore implements ObjectStore {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  readonly signed: { op: "put" | "get"; key: string }[] = [];

  /** Test helper: simulate the CLI having uploaded bytes. */
  upload(key: string, body: Buffer | string, contentType = "application/octet-stream"): void {
    this.objects.set(key, { body: Buffer.isBuffer(body) ? body : Buffer.from(body), contentType });
  }

  async presignPut(key: string, contentType: string, ttlSec: number) {
    this.signed.push({ op: "put", key });
    return { url: `https://fake-s3.local/${key}?X-Amz-Expires=${ttlSec}&op=put`, headers: { "content-type": contentType } };
  }

  async presignGet(key: string, ttlSec: number): Promise<string> {
    this.signed.push({ op: "get", key });
    return `https://fake-s3.local/${key}?X-Amz-Expires=${ttlSec}&op=get`;
  }

  async head(key: string): Promise<ObjectHead | null> {
    const o = this.objects.get(key);
    return o ? { sizeBytes: o.body.length, etag: `"${createHash("md5").update(o.body).digest("hex")}"` } : null;
  }

  async sha256(key: string): Promise<string> {
    const o = this.objects.get(key);
    if (!o) throw new Error(`NoSuchKey: ${key}`);
    return createHash("sha256").update(o.body).digest("hex");
  }

  async putJson(key: string, body: unknown): Promise<void> {
    this.upload(key, JSON.stringify(body, null, 2), "application/json");
  }
}
