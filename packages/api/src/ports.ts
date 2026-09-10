/**
 * Storage ports. The service depends on these interfaces only; tests supply
 * in-memory fakes (see fakes.ts) and production wires DynamoDB + S3.
 */
import type { BaseItem } from "@aventiqlab/alchemy-core";

export interface Key {
  PK: string;
  SK: string;
}

export interface Page<T> {
  items: T[];
  cursor: string | null;
}

export interface StatusGuard extends Key {
  /** Transaction fails unless the item exists and its `status` equals this. */
  expectedStatus: string;
}

export class ConflictError extends Error {
  constructor(message = "conditional write failed") {
    super(message);
    this.name = "ConflictError";
  }
}

export interface ContentStore {
  get<T extends BaseItem>(key: Key): Promise<T | null>;
  /** Query one partition, optionally by SK prefix. Returns everything (partitions are small). */
  query<T extends BaseItem>(pk: string, skPrefix?: string): Promise<T[]>;
  queryIndex<T extends BaseItem>(
    index: "GSI1" | "GSI2",
    pk: string,
    opts?: { skPrefix?: string; limit?: number; cursor?: string },
  ): Promise<Page<T>>;
  batchPut(items: BaseItem[]): Promise<void>;
  batchDelete(keys: Key[]): Promise<void>;
  /** All-or-nothing put with optional status guards on existing items. */
  transactPut(items: BaseItem[], guards?: StatusGuard[]): Promise<void>;
}

export interface ObjectHead {
  sizeBytes: number;
  etag: string;
}

export interface ObjectStore {
  presignPut(key: string, contentType: string, ttlSec: number): Promise<{ url: string; headers: Record<string, string> }>;
  presignGet(key: string, ttlSec: number, responseContentType?: string): Promise<string>;
  head(key: string): Promise<ObjectHead | null>;
  /** Streams the object and returns its hex SHA-256. Callers gate on size first. */
  sha256(key: string): Promise<string>;
  putJson(key: string, body: unknown): Promise<void>;
}

export interface Clock {
  now(): string;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };
