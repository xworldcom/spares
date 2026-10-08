import { updateJsonDocument } from "./json-document.ts";

/** Persisted in platform-settings.json for platform-owner visibility (no Vercel logs required). */
export type BlobCasTelemetry = {
  phantom412Count?: number;
  phantom412LastAt?: string;
  phantom412LastPath?: string;
};

export function parseBlobCasTelemetry(
  doc: Record<string, unknown> | null | undefined,
): BlobCasTelemetry {
  if (!doc) {
    return {};
  }
  const next: BlobCasTelemetry = {};
  if (typeof doc.phantom412Count === "number" && Number.isFinite(doc.phantom412Count)) {
    next.phantom412Count = Math.max(0, Math.floor(doc.phantom412Count));
  }
  if (typeof doc.phantom412LastAt === "string" && doc.phantom412LastAt.trim()) {
    next.phantom412LastAt = doc.phantom412LastAt;
  }
  if (typeof doc.phantom412LastPath === "string" && doc.phantom412LastPath.trim()) {
    next.phantom412LastPath = doc.phantom412LastPath;
  }
  return next;
}

export async function recordBlobCasPhantom412(pathname: string): Promise<BlobCasTelemetry> {
  const at = new Date().toISOString();
  return await updateJsonDocument("platformSettings", (raw) => {
    let current: Record<string, unknown> = {};
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
          current = parsed;
        }
      } catch {
        current = {};
      }
    }
    const prior = parseBlobCasTelemetry(current);
    const next: BlobCasTelemetry = {
      phantom412Count: (prior.phantom412Count ?? 0) + 1,
      phantom412LastAt: at,
      phantom412LastPath: pathname,
    };
    const merged = {
      ...current,
      ...next,
      schemaVersion: typeof current.schemaVersion === "number" ? current.schemaVersion : 2,
    };
    return { json: JSON.stringify(merged, null, 2), result: next };
  });
}
