import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  formatCatalogVersionKey,
  peekCatalogVersionsCoalesced,
} from "./catalog-version-peek.ts";
import { blobReadBytesHeaders, resetBlobReadBytes } from "./blob-read-bytes.ts";

type CacheEntry = {
  catalogKey: string;
  etag: string;
  json: string;
  builtAt: number;
};

const LIST_CACHE = new Map<string, CacheEntry>();
const MAX_ENTRIES = 96;

function pruneCache() {
  if (LIST_CACHE.size <= MAX_ENTRIES) {
    return;
  }
  const entries = [...LIST_CACHE.entries()].sort((a, b) => a[1].builtAt - b[1].builtAt);
  for (let i = 0; i < entries.length - MAX_ENTRIES; i++) {
    LIST_CACHE.delete(entries[i][0]);
  }
}

/** Catalog blob versions — same gate as in-process catalog memory (#377). */
export async function catalogVersionKey(): Promise<string> {
  return formatCatalogVersionKey(await peekCatalogVersionsCoalesced());
}

function weakEtag(scopeKey: string, catalogKey: string) {
  const hash = createHash("sha256")
    .update(scopeKey)
    .update("\0")
    .update(catalogKey)
    .digest("base64url");
  return `W/"${hash.slice(0, 24)}"`;
}

export function clearDerivedListCachesForTests() {
  LIST_CACHE.clear();
}

/**
 * Version-gated derived list JSON with ETag / 304. Invalidates automatically when
 * catalog versions change (no stale rows after writes).
 */
export async function respondDerivedList(
  request: NextRequest,
  scopeKey: string,
  build: () => Promise<unknown>,
): Promise<NextResponse> {
  resetBlobReadBytes();
  const catalogKey = await catalogVersionKey();
  const etag = weakEtag(scopeKey, catalogKey);
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, must-revalidate",
        ...blobReadBytesHeaders(),
      },
    });
  }

  const hit = LIST_CACHE.get(scopeKey);
  if (hit && hit.catalogKey === catalogKey && hit.etag === etag) {
    return new NextResponse(hit.json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ETag: etag,
        "Cache-Control": "private, must-revalidate",
        ...blobReadBytesHeaders(),
      },
    });
  }

  const payload = await build();
  const json = JSON.stringify(payload);
  LIST_CACHE.set(scopeKey, { catalogKey, etag, json, builtAt: Date.now() });
  pruneCache();

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ETag: etag,
      "Cache-Control": "private, must-revalidate",
      ...blobReadBytesHeaders(),
    },
  });
}
