/**
 * S3-backed content-addressed TTS cache (CD-21):
 *   s3://{bucket}/tts-cache/{narration_hash}.wav
 *
 * A `narration_hash` is `sha256:<hex>` (AL8 §1.5). The object key drops the
 * `sha256:` prefix.
 */
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { AudioCache } from '../audio/synthesize.js';

function keyFor(narrationHash: string): string {
  const hex = narrationHash.startsWith('sha256:') ? narrationHash.slice('sha256:'.length) : narrationHash;
  return `tts-cache/${hex}.wav`;
}

export class S3AudioCache implements AudioCache {
  readonly #s3: S3Client;
  readonly #bucket: string;

  constructor(bucket: string, region: string, s3?: S3Client) {
    this.#bucket = bucket;
    this.#s3 = s3 ?? new S3Client({ region });
  }

  async fetch(key: string, destAbsPath: string): Promise<boolean> {
    try {
      const res = await this.#s3.send(new GetObjectCommand({ Bucket: this.#bucket, Key: keyFor(key) }));
      if (!res.Body) return false;
      await pipeline(res.Body as Readable, createWriteStream(destAbsPath));
      return true;
    } catch (err) {
      const name = (err as { name?: string }).name;
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (name === 'NoSuchKey' || name === 'NotFound' || status === 404) return false;
      throw err;
    }
  }

  async put(key: string, srcAbsPath: string): Promise<void> {
    const body = await readFile(srcAbsPath);
    await this.#s3.send(
      new PutObjectCommand({ Bucket: this.#bucket, Key: keyFor(key), Body: body, ContentType: 'audio/wav' }),
    );
  }
}

/** Local-directory cache for dev smoke runs. */
export class DirAudioCache implements AudioCache {
  constructor(private readonly dir: string) {}
  async fetch(key: string, destAbsPath: string): Promise<boolean> {
    const { copyFile, access } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const src = join(this.dir, `${key.replace('sha256:', '')}.wav`);
    try {
      await access(src);
      await copyFile(src, destAbsPath);
      return true;
    } catch {
      return false;
    }
  }
  async put(key: string, srcAbsPath: string): Promise<void> {
    const { copyFile, mkdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    await mkdir(this.dir, { recursive: true });
    await copyFile(srcAbsPath, join(this.dir, `${key.replace('sha256:', '')}.wav`));
  }
}

export { keyFor as ttsCacheKey };
