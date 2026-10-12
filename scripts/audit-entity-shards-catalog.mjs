#!/usr/bin/env node
/**
 * Read-only: catalog (care.json tickets) vs ticket shards. Requires BLOB_READ_WRITE_TOKEN.
 * Exit 1 if any shard-only ticket IDs exist (not in catalog).
 */
import { get, list } from "@vercel/blob";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
const localCare = process.env.AUDIT_CARE_JSON?.trim();
const tenantId = process.env.SPARES_TENANT_ID?.trim() || "tenant-oee360-host";
const ns = process.env.SPARES_BLOB_NAMESPACE?.trim()
  ? `${process.env.SPARES_BLOB_NAMESPACE.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")}/`
  : "";
const carePath = `spares/${ns}care.json`;
const shardPrefix = `spares/${ns}records/ticket__${tenantId}__`;

function ticketIdsFromCareJson(text) {
  const care = JSON.parse(text);
  const tickets = care.tickets ?? [];
  return new Set(tickets.filter((t) => (t.tenantId ?? tenantId) === tenantId).map((t) => t.id));
}

async function loadCareIds() {
  if (localCare && existsSync(localCare)) {
    return ticketIdsFromCareJson(readFileSync(localCare, "utf8"));
  }
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN or AUDIT_CARE_JSON required");
  }
  const result = await get(carePath, { access: "private", token });
  if (!result?.stream) {
    throw new Error(`Missing ${carePath}`);
  }
  const text = Buffer.from(await new Response(result.stream).arrayBuffer()).toString("utf8");
  return ticketIdsFromCareJson(text);
}

function shardIdFromPath(pathname) {
  const suffix = pathname.slice(shardPrefix.length);
  return suffix.endsWith(".json") ? suffix.slice(0, -".json".length) : suffix;
}

async function listTicketShardIds() {
  if (!token) {
    const dir = process.env.AUDIT_SHARD_DIR?.trim();
    if (!dir) {
      return new Set();
    }
    const { readdirSync } = await import("node:fs");
    const ids = new Set();
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(`ticket__${tenantId}__`) || !name.endsWith(".json")) {
        continue;
      }
      ids.add(name.slice(`ticket__${tenantId}__`.length, -".json".length));
    }
    return ids;
  }
  const ids = new Set();
  let cursor;
  do {
    const page = await list({ prefix: shardPrefix, cursor, limit: 1000, token });
    for (const blob of page.blobs) {
      ids.add(shardIdFromPath(blob.pathname));
    }
    cursor = page.cursor;
  } while (cursor);
  return ids;
}

async function main() {
  const catalogIds = await loadCareIds();
  const shardIds = await listTicketShardIds();
  const shardOnly = [...shardIds].filter((id) => !catalogIds.has(id));
  const catalogMissingShard = [...catalogIds].filter((id) => !shardIds.has(id));
  const report = {
    at: new Date().toISOString(),
    tenantId,
    catalogTicketCount: catalogIds.size,
    shardTicketCount: shardIds.size,
    shardOnlyCount: shardOnly.length,
    shardOnlyIds: shardOnly.slice(0, 50),
    catalogWithoutShardCount: catalogMissingShard.length,
    catalogCompleteForSoT: shardOnly.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(shardOnly.length > 0 ? 2 : 0);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
