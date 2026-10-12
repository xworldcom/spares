import { updateJsonPathDocument } from "./json-path-document.ts";
import { entityRecordPath } from "./entity-record-paths.ts";
import { isManagedRuntime } from "./production-env.ts";
import type { QuoteRecord, ServiceTicketRecord } from "@/types";
import type { StoredPartLifecycle } from "./part-lifecycle.ts";

/** Kevin subtract-shards: catalog CAS is SoT; shards opt-in only (off on Vercel by default). */
export function entityShardsEnabled(db: {
  dataMigrations?: { entityShardsV1?: number };
}) {
  if (isManagedRuntime()) {
    const override = process.env.SPARES_ENTITY_SHARDS?.trim().toLowerCase();
    if (override !== "1" && override !== "true") {
      return false;
    }
  }
  return (db.dataMigrations?.entityShardsV1 ?? 0) >= 1;
}

export async function writeQuoteShard(tenantId: string, quote: QuoteRecord) {
  const pathname = entityRecordPath("quote", tenantId, quote.id);
  const json = JSON.stringify(quote);
  await updateJsonPathDocument(pathname, () => ({ json, result: quote }));
}

export async function readQuoteShard(tenantId: string, quoteId: string) {
  const pathname = entityRecordPath("quote", tenantId, quoteId);
  const { getPersistence } = await import("./persistence.ts");
  const { json } = await getPersistence().readVersionedPath(pathname);
  if (!json) {
    return null;
  }
  return JSON.parse(json) as QuoteRecord;
}

export async function writeTicketShard(tenantId: string, ticket: ServiceTicketRecord) {
  const pathname = entityRecordPath("ticket", tenantId, ticket.id);
  const json = JSON.stringify(ticket);
  await updateJsonPathDocument(pathname, () => ({ json, result: ticket }));
}

export async function writeLifecycleShard(tenantId: string, row: StoredPartLifecycle) {
  const pathname = entityRecordPath("lifecycle", tenantId, row.id);
  const json = JSON.stringify(row);
  await updateJsonPathDocument(pathname, () => ({ json, result: row }));
}
