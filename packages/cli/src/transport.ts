/**
 * The CLI's only I/O boundary. The real transport speaks HTTPS to the Alchemy
 * API and PUTs files to presigned S3 URLs. Tests swap in an in-process
 * transport that talks to the API's router + in-memory fakes.
 */
import { openAsBlob } from "node:fs";
import type { ErrorBody } from "@aventiqlab/alchemy-core";

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
}

export interface Transport {
  request<T = unknown>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<ApiResult<T>>;
  upload(url: string, headers: Record<string, string>, filePath: string): Promise<void>;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function unwrap<T>(res: ApiResult<T>, what: string): T {
  if (res.status >= 200 && res.status < 300) return res.body;
  const err = (res.body as ErrorBody | undefined)?.error;
  throw new ApiRequestError(res.status, err?.code ?? "http_error", `${what}: ${err?.message ?? `HTTP ${res.status}`}`, err?.details);
}

export class HttpTransport implements Transport {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async request<T = unknown>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<ApiResult<T>> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = { error: { code: "http_error", message: text.slice(0, 200) } };
    }
    return { status: res.status, body: parsed as T };
  }

  async upload(url: string, headers: Record<string, string>, filePath: string): Promise<void> {
    // openAsBlob streams the file; no need to buffer a large video in memory.
    const blob = await openAsBlob(filePath, { type: headers["content-type"] });
    const res = await fetch(url, { method: "PUT", headers, body: blob });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      throw new Error(`upload failed (${res.status}) for ${filePath}: ${text}`);
    }
  }
}
