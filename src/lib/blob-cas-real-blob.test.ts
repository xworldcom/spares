import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { blobCarePath, blobDbPath } from "./blob-paths.ts";
import { createFakeVercelBlob, type FakeVercelBlobOptions } from "./fake-vercel-blob.ts";
import { createBlobPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  appendTicketActivity,
  createMachine,
  createQuote,
  createTicket,
  listMachines,
  resetStoreMemoryForTests,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const T = DEFAULT_TENANT_ID;
const envKeys = ["SPARES_ALLOW_SEED", "SPARES_DATA_DIR", "VERCEL"] as const;
const previous: Record<string, string | undefined> = {};
for (const key of envKeys) {
  previous[key] = process.env[key];
}

function rawMachine(id: string, name: string) {
  return {
    id,
    name,
    storedFileName: `${id}.glb`,
    originalFileName: `${id}.glb`,
    parts: [],
    unmatched: [],
    createdAt: "2020-01-01T00:00:00.000Z",
    tenantId: T,
    version: 1,
  };
}

function catalog() {
  return {
    schemaVersion: 3,
    tenants: [
      { id: T, name: "OEE360 Host", slug: "oee360-host", createdAt: "2020-01-01T00:00:00.000Z" },
    ],
    customers: [],
    sites: [],
    users: [],
    machines: [rawMachine("line-1", "Line 1")],
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

async function start(options: FakeVercelBlobOptions) {
  process.env.SPARES_ALLOW_SEED = "false";
  delete process.env.SPARES_DATA_DIR;
  delete process.env.VERCEL;
  const blob = createFakeVercelBlob(options);
  setPersistenceForTests(createBlobPersistence(blob.client));
  await blob.externalPut(blobDbPath(), JSON.stringify(catalog(), null, 2));
  resetStoreMemoryForTests();
  return blob;
}

const customer = { customerId: "c", customerEmail: "c@example.com" };

async function submitQuoteAndReply() {
  const quote = await createQuote(T, {
    machineId: "line-1",
    items: [{ id: "P-1", qty: 2 }],
    ...customer,
  });
  assert.ok(!("error" in quote), "quote submit must not throw or fail");

  const ticket = await createTicket(T, {
    machineId: "line-1",
    title: "Care request",
    ...customer,
    actor: { email: "c@example.com", role: "customer", id: "c" },
  });
  assert.ok("ticket" in ticket && ticket.ticket);
  const reply = await appendTicketActivity(
    ticket.ticket.id,
    T,
    { email: "staff@example.com", role: "staff", id: "s" },
    "On it",
  );
  assert.ok(reply && !("error" in reply), "care reply must not throw or fail");
  return { quote, ticket: ticket.ticket };
}

describe("catalog CAS against Vercel Blob's real ETag / ifMatch rules", () => {
  beforeEach(() => {
    resetStoreMemoryForTests();
  });

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

  for (const edgeEtag of ["same", "weak", "edge"] as const) {
    it(`quote submit and care reply persist when the edge ETag is ${edgeEtag}`, async () => {
      const blob = await start({ edgeEtag });
      const { quote, ticket } = await submitQuoteAndReply();

      resetStoreMemoryForTests();
      const db = JSON.parse(blob.body(blobDbPath())!) as {
        quotes: Array<{ id: string }>;
        tickets: Array<{ id: string; activities: unknown[] }>;
      };
      assert.ok("id" in quote && db.quotes.some((row) => row.id === quote.id));
      const stored = db.tickets.find((row) => row.id === ticket.id);
      assert.ok(stored, "ticket in db.json");
      assert.equal(stored.activities.length, 2, "customer open + staff reply");
      const care = JSON.parse(blob.body(blobCarePath())!) as { tickets: Array<{ id: string }> };
      assert.ok(care.tickets.some((row) => row.id === ticket.id), "ticket in care.json");
      assert.equal(blob.calls.precondition412, 0, "no spurious 412s");
    });
  }

  it("a genuine 412 (another instance wrote first) retries on the latest and keeps both", async () => {
    let raced = true;
    const blob = await start({
      edgeEtag: "weak",
      async beforePut(pathname) {
        if (raced || pathname !== blobDbPath()) {
          return;
        }
        raced = true;
        const current = JSON.parse(blob.body(pathname)!) as ReturnType<typeof catalog>;
        current.machines.push(rawMachine("other-instance", "Added by the other instance"));
        await blob.externalPut(pathname, JSON.stringify(current, null, 2));
      },
    });
    await listMachines(T);
    raced = false;
    await createMachine(T, { name: "Added by this request" });

    resetStoreMemoryForTests();
    const names = (await listMachines(T)).map((machine) => machine.name);
    assert.ok(names.includes("Added by this request"));
    assert.ok(names.includes("Added by the other instance"));
    assert.ok(blob.calls.precondition412 >= 1, "the racing write produced a real 412");
  });

  it("a platform that rejects every ifMatch degrades to head-compare writes, not 500s", async () => {
    const blob = await start({ edgeEtag: "weak", rejectEveryIfMatch: true });
    await submitQuoteAndReply();

    resetStoreMemoryForTests();
    const db = JSON.parse(blob.body(blobDbPath())!) as { quotes: unknown[]; tickets: unknown[] };
    assert.equal(db.quotes.length, 1);
    assert.equal(db.tickets.length, 1);
  });

  it("with ifMatch unusable, a stale version is still refused and a current one still lands", async () => {
    const blob = createFakeVercelBlob({ edgeEtag: "weak", rejectEveryIfMatch: true });
    const persistence = createBlobPersistence(blob.client);
    const path = blobDbPath();

    assert.deepEqual(await persistence.writeIfVersion("database", '{"n":1}', null), {
      ok: true,
      version: (await blob.client.head(path)).etag,
    });
    const first = await persistence.readVersioned("database");
    await blob.externalPut(path, '{"n":2}');

    const stale = await persistence.writeIfVersion("database", '{"n":3}', first.version);
    assert.equal(stale.ok, false, "another writer got there first");
    assert.equal(blob.body(path), '{"n":2}', "the stale write changed nothing");

    const current = await persistence.readVersioned("database");
    const landed = await persistence.writeIfVersion("database", '{"n":4}', current.version);
    assert.equal(landed.ok, true, "a write on the version just read is accepted");
    assert.equal(blob.body(path), '{"n":4}');
  });

  it("the version from a commit read is the API ETag and is accepted by ifMatch", async () => {
    const blob = createFakeVercelBlob({ edgeEtag: "weak" });
    const persistence = createBlobPersistence(blob.client);
    const path = blobCarePath();
    assert.deepEqual(await persistence.readVersioned("care"), { json: null, version: null });
    await persistence.writeIfVersion("care", '{"n":1}', null);
    const read = await persistence.readVersioned("care");
    assert.equal(read.version, (await blob.client.head(path)).etag);
    assert.equal((await persistence.writeIfVersion("care", '{"n":2}', read.version)).ok, true);
    assert.equal((await persistence.writeIfVersion("care", '{"n":3}', read.version)).ok, false);
    assert.equal(blob.calls.precondition412, 1, "only the genuinely stale write got a 412");
  });
});
