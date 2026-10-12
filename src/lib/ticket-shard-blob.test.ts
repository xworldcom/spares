import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { blobCarePath, blobDbPath } from "./blob-paths.ts";
import { createFakeVercelBlob } from "./fake-vercel-blob.ts";
import { entityRecordPath } from "./entity-record-paths.ts";
import { createBlobPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createTicket,
  resetStoreMemoryForTests,
  updateTicketStatus,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const T = DEFAULT_TENANT_ID;
const worker = fileURLToPath(new URL("./ticket-shard-status.fixture.ts", import.meta.url));

const envKeys = ["SPARES_ALLOW_SEED", "SPARES_DATA_DIR", "VERCEL"] as const;
const previous: Record<string, string | undefined> = {};
for (const key of envKeys) {
  previous[key] = process.env[key];
}

function catalogWithShards() {
  return {
    schemaVersion: 3,
    dataMigrations: { entityShardsV1: 1, catalogHealDeferredV1: 1 },
    tenants: [
      { id: T, name: "OEE360 Host", slug: "oee360-host", createdAt: "2020-01-01T00:00:00.000Z" },
    ],
    customers: [],
    sites: [],
    users: [],
    machines: [
      {
        id: "line-1",
        name: "Line 1",
        storedFileName: "line-1.glb",
        originalFileName: "line-1.glb",
        parts: [],
        unmatched: [],
        createdAt: "2020-01-01T00:00:00.000Z",
        tenantId: T,
        version: 1,
      },
    ],
    quotes: [],
    bugReports: [],
    accessInquiries: [],
    machineViews: [],
    manuals: [],
    tickets: [],
    machineUsage: [],
    partLifecycle: [],
  };
}

async function startBlob() {
  process.env.SPARES_ALLOW_SEED = "false";
  delete process.env.SPARES_DATA_DIR;
  delete process.env.VERCEL;
  const blob = createFakeVercelBlob({ edgeEtag: "weak" });
  setPersistenceForTests(createBlobPersistence(blob.client));
  await blob.externalPut(blobDbPath(), JSON.stringify(catalogWithShards(), null, 2));
  await blob.externalPut(blobCarePath(), JSON.stringify({ tickets: [] }, null, 2));
  resetStoreMemoryForTests();
  return blob;
}

function runWorker(blobDir: string, args: string[]) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", worker, ...args], {
      env: {
        ...process.env,
        SPARES_ALLOW_SEED: "false",
        SPARES_DATA_DIR: blobDir,
        VERCEL: "",
        BLOB_READ_WRITE_TOKEN: "test",
        TICKET_SHARD_BLOB_FIXTURE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output }));
  });
}

describe("ticket shards with entityShardsV1 on blob persistence", () => {
  beforeEach(() => resetStoreMemoryForTests());

  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    for (const key of envKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it("createTicket dual-writes catalog and ticket shard (prod gate singleSession)", async () => {
    const blob = await startBlob();
    const created = await createTicket(T, {
      machineId: "line-1",
      title: "CAS shard",
      customerId: "c",
      customerEmail: "c@example.com",
      actor: { email: "staff@spares.local", role: "staff", id: "staff" },
    });
    assert.ok("ticket" in created);
    const ticket = created.ticket;
    const shardPath = entityRecordPath("ticket", T, ticket.id);
    assert.ok(blob.body(shardPath), "ticket shard must exist after create");

    const staff = { id: "staff", email: "staff@spares.local", role: "staff" as const };
    const updated = await updateTicketStatus(ticket.id, T, "in_progress", staff, {
      actor: { id: staff.id, email: staff.email, name: "Staff" },
      lock: { base: ticket, expectedVersion: 1, touchedFields: ["status"] },
    });
    assert.equal(updated?.status, "in_progress");
    const shard = JSON.parse(blob.body(shardPath)!) as { status: string };
    assert.equal(shard.status, "in_progress");
  });

  it("two processes: create then status PATCH without 500 (shared fs + entityShardsV1)", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const dir = await mkdtemp(path.join(tmpdir(), "ticket-shard-procs-"));
    await mkdir(path.join(dir, "files"), { recursive: true });
    const catalog = catalogWithShards();
    await writeFile(path.join(dir, "db.json"), JSON.stringify(catalog, null, 2));
    await writeFile(path.join(dir, "care.json"), JSON.stringify({ tickets: [] }, null, 2));

    const create = await runWorker(dir, ["create"]);
    assert.equal(create.code, 0, create.output);
    const ticketId = create.output.trim().split("\n").pop()?.trim();
    assert.ok(ticketId);

    const status = await runWorker(dir, ["status", ticketId!]);
    assert.equal(status.code, 0, status.output);
    assert.match(status.output, /in_progress/);
  });
});
