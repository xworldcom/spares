import { blobNamespace } from "./blob-paths.ts";

export type EntityRecordKind = "quote" | "ticket" | "lifecycle";

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

/** Durable JSON path for a hot row (CAS per object, not whole catalog). */
export function entityRecordPath(
  kind: EntityRecordKind,
  tenantId: string,
  recordId: string,
) {
  const ns = blobNamespace();
  const tenant = safeSegment(tenantId);
  const id = safeSegment(recordId);
  return `spares/${ns}records/${kind}/${tenant}/${id}.json`;
}
