import type { BlobClient } from "./persistence.ts";

/** Same shape and message as `@vercel/blob`'s errors (the SDK does not set `name`). */
export class BlobPreconditionFailedError extends Error {
  constructor() {
    super("Vercel Blob: Precondition failed: ETag mismatch.");
    this.name = "BlobPreconditionFailedError";
  }
}

export class BlobNotFoundError extends Error {
  constructor() {
    super("Vercel Blob: The requested blob does not exist");
  }
}

export class BlobError extends Error {}

/**
 * How the storage edge (the `get` plane) reports ETags relative to the Blob API (the
 * `put` / `head` plane), which is the only one `ifMatch` is compared against:
 * - `same`: identical strong ETag (what a naive fake assumes)
 * - `weak`: `W/"…"`, as when an edge compresses a strong validator
 * - `edge`: an unrelated edge-generated validator
 */
export type EdgeEtagStyle = "same" | "weak" | "edge";

export type FakeVercelBlobOptions = {
  edgeEtag?: EdgeEtagStyle;
  /** The API rejects every `ifMatch`, even a correct one (a platform quirk). */
  rejectEveryIfMatch?: boolean;
  /** Called before each API write lands, to simulate another instance racing in. */
  beforePut?: (pathname: string) => Promise<void> | void;
};

/**
 * Stand-in for a private Vercel Blob store that follows the real conditional-put rules:
 * `ifMatch` is compared byte-for-byte with the API ETag (412 / BlobPreconditionFailedError),
 * `ifMatch` + `allowOverwrite:false` is rejected by the SDK, and a plain put on an existing
 * pathname without `allowOverwrite` fails.
 */
export function createFakeVercelBlob(options: FakeVercelBlobOptions = {}) {
  const style = options.edgeEtag ?? "weak";
  const objects = new Map<string, { body: string; etag: string; edgeEtag: string }>();
  const calls = { put: 0, get: 0, head: 0, precondition412: 0 };
  let counter = 0;

  const client: BlobClient = {
    async put(pathname, body, putOptions) {
      calls.put += 1;
      const ifMatch = putOptions.ifMatch as string | undefined;
      if (ifMatch && putOptions.allowOverwrite === false) {
        throw new BlobError(
          "Vercel Blob: ifMatch and allowOverwrite: false are contradictory. ifMatch is used for conditional overwrites, which requires allowOverwrite to be true.",
        );
      }
      await options.beforePut?.(pathname);
      const existing = objects.get(pathname);
      if (ifMatch) {
        if (options.rejectEveryIfMatch || !existing || existing.etag !== ifMatch) {
          calls.precondition412 += 1;
          throw new BlobPreconditionFailedError();
        }
      } else if (existing && putOptions.allowOverwrite !== true) {
        throw new BlobError(
          "Vercel Blob: This blob already exists, use `allowOverwrite: true` option to overwrite it",
        );
      }
      counter += 1;
      const etag = `"${counter.toString(16).padStart(8, "0")}a1b2"`;
      const edgeEtag =
        style === "same" ? etag : style === "weak" ? `W/${etag}` : `edge-${counter}-gzip`;
      objects.set(pathname, { body: String(body), etag, edgeEtag });
      return { etag };
    },
    async get(pathname) {
      calls.get += 1;
      const found = objects.get(pathname);
      if (!found) {
        return null;
      }
      return {
        statusCode: 200,
        stream: new Response(found.body).body,
        blob: { etag: found.edgeEtag },
      };
    },
    async head(pathname) {
      calls.head += 1;
      const found = objects.get(pathname);
      if (!found) {
        throw new BlobNotFoundError();
      }
      return { etag: found.etag };
    },
    async del(pathname) {
      objects.delete(pathname);
    },
  };

  return {
    client,
    calls,
    objects,
    /** Another instance's write, straight to the store. */
    async externalPut(pathname: string, body: string) {
      await client.put(pathname, body, { allowOverwrite: true });
    },
    body(pathname: string) {
      return objects.get(pathname)?.body ?? null;
    },
  };
}
