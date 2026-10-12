import { entityRecordPath } from "./entity-record-paths.ts";
import { writeTicketShard } from "./entity-record-store.ts";
import { getPersistence } from "./persistence.ts";
import type { ServiceTicketRecord } from "@/types";

export type TicketShardPersistErrorBody = {
  error: string;
  code: "TicketShardPersistError";
  blobErrorName: string;
  blobStatus?: number;
};

function blobCauseMeta(cause: unknown): { blobErrorName: string; blobStatus?: number } {
  if (cause instanceof Error) {
    const withStatus = cause as unknown as { statusCode?: number };
    const blobStatus =
      typeof withStatus.statusCode === "number" ? withStatus.statusCode : undefined;
    return { blobErrorName: cause.name || "Error", blobStatus };
  }
  return { blobErrorName: "UnknownError" };
}

export function ticketShardPersistErrorBody(err: TicketShardPersistError): TicketShardPersistErrorBody {
  const { blobErrorName, blobStatus } = blobCauseMeta(err.cause);
  return {
    error: err.message,
    code: "TicketShardPersistError",
    blobErrorName,
    ...(blobStatus != null ? { blobStatus } : {}),
  };
}

export class TicketShardPersistError extends Error {
  readonly pathname: string;

  constructor(pathname: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Could not save ticket record shard (${detail}). Please try again.`);
    this.name = "TicketShardPersistError";
    this.pathname = pathname;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

/** Dual-write catalog row → per-ticket JSON shard (prod entityShardsV1). Logs Blob faults. */
export async function persistTicketShard(
  tenantId: string,
  ticket: ServiceTicketRecord,
  context: string,
) {
  const pathname = entityRecordPath("ticket", tenantId, ticket.id);
  try {
    await writeTicketShard(tenantId, ticket);
  } catch (cause) {
    console.error(`[ticket-shard] ${context} pathname=${pathname}`, cause);
    throw new TicketShardPersistError(pathname, cause);
  }
}

/** Materialize a catalog ticket row into its shard when entityShardsV1 is on (legacy rows). */
export async function ensureTicketShardFromCatalog(
  tenantId: string,
  ticket: ServiceTicketRecord,
) {
  const pathname = entityRecordPath("ticket", tenantId, ticket.id);
  const { json } = await getPersistence().readVersionedPath(pathname);
  if (json) {
    return;
  }
  await persistTicketShard(tenantId, ticket, "ensureTicketShardFromCatalog");
}
