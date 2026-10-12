import type { RecordMeta } from "./record-meta.ts";
import { messageSenderDisplayName } from "./ui/message-sender-display.ts";

export const RECORD_CONFLICT_CODE = "record-conflict";

export type RecordConflictBody = {
  error: string;
  code: typeof RECORD_CONFLICT_CODE;
  recordVersion: number;
  lastModifiedAt: string;
  lastModifiedByName: string;
  lastModifiedByUserId?: string;
};

export class RecordWriteConflictError extends Error {
  readonly meta: RecordMeta;

  constructor(meta: RecordMeta) {
    super("Record changed on the server before this save landed.");
    this.name = "RecordWriteConflictError";
    this.meta = meta;
  }
}

function writerLabel(meta: RecordMeta) {
  const raw = meta.lastModifiedByName?.trim();
  if (raw && !raw.includes("@")) {
    return raw;
  }
  if (raw?.includes("@")) {
    return raw.split("@")[0]?.replace(/\./g, " ").trim() || raw;
  }
  return "Someone else";
}

export function recordConflictMessage(entityLabel: string, meta: RecordMeta) {
  const who = writerLabel(meta);
  const when = formatConflictWhen(meta.lastModifiedAt);
  return `This ${entityLabel} was updated by ${who} ${when}. Refresh to see their changes, or keep editing and try again.`;
}

function formatConflictWhen(iso: string) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return "recently";
  }
  const deltaSec = Math.round((Date.now() - at) / 1000);
  if (deltaSec < 10) {
    return "just now";
  }
  if (deltaSec < 90) {
    return "a moment ago";
  }
  if (deltaSec < 3600) {
    const min = Math.max(1, Math.round(deltaSec / 60));
    return `${min} minute${min === 1 ? "" : "s"} ago`;
  }
  return "recently";
}

export function recordConflictResponse(entityLabel: string, meta: RecordMeta) {
  const body: RecordConflictBody = {
    error: recordConflictMessage(entityLabel, meta),
    code: RECORD_CONFLICT_CODE,
    recordVersion: meta.recordVersion,
    lastModifiedAt: meta.lastModifiedAt,
    lastModifiedByName: writerLabel(meta),
    lastModifiedByUserId: meta.lastModifiedByUserId,
  };
  return Response.json(body, {
    status: 409,
    headers: { "Cache-Control": "private, no-store", "Retry-After": "1" },
  });
}

export function withRecordConflict<A extends unknown[], R extends Response | undefined>(
  entityLabel: string,
  handler: (...args: A) => Promise<R>,
) {
  return async (...args: A): Promise<R | Response> => {
    try {
      return await handler(...args);
    } catch (cause) {
      if (cause instanceof RecordWriteConflictError) {
        return recordConflictResponse(entityLabel, cause.meta);
      }
      throw cause;
    }
  };
}
