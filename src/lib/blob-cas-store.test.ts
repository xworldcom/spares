import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { DEMO_TENANT_BUYER } from "./demo-tenant-data-migration.ts";
import {
  createMemoryPersistence,
  setPersistenceForTests,
  type Persistence,
} from "./persistence.ts";
import { FIXTURE_MACHINE_IDS } from "./seed-fixtures.ts";
import {
  CatalogWriteConflictError,
  createMachine,
  createManual,
  createTicket,
  findUserByEmail,
  getMachine,
  listMachines,
  resetStoreMemoryForTests,
  updatePerson,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const T = DEFAULT_TENANT_ID;
const HW = FIXTURE_MACHINE_IDS.hardware;
const envKeys = ["SPARES_ALLOW_SEED", "SPARES_DATA_DIR", "VERCEL"] as const;
const previous: Record<string, string | undefined> = {};
for (const key of envKeys) {
  previous[key] = process.env[key];
}

type Doc = "database" | "care";

/**
 * A remote-like backend (process memory is never trusted) that lets a test run another
 * "serverless instance" write in the window between this request's read and its write.
 */
function racingStore() {
  const inner = createMemoryPersistence();
  let hook: { doc: Doc; run: () => Promise<void>; times: number } | null = null;
  async function fire(doc: Doc) {
    const armed = hook;
    if (!armed || armed.doc !== doc) {
      return;
    }
    armed.times -= 1;
    if (armed.times <= 0) {
      hook = null;
    }
    await armed.run();
  }
  const persistence = {
    ...inner,
    kind: "blob",
    async writeDatabaseJson(json: string) {
      await fire("database");
      return inner.writeDatabaseJson(json);
    },
    async writeCareJson(json: string) {
      await fire("care");
      return inner.writeCareJson(json);
    },
    async writeIfVersion(doc: Doc, json: string, expected: string | null) {
      await fire(doc);
      return inner.writeIfVersion(doc, json, expected);
    },
  } as Persistence;
  return {
    persistence,
    inner,
    /** Run `run` (another instance's write) just before the next write to `doc`. */
    beforeWrite(doc: Doc, run: () => Promise<void>, times = 1) {
      hook = { doc, run, times };
    },
    async rawDb() {
      return JSON.parse((await inner.readDatabaseJson()) ?? "{}") as RawDb;
    },
    async rawCare() {
      return JSON.parse((await inner.readCareJson()) ?? "{}") as RawCare;
    },
    /** Another instance edits db.json directly. */
    async otherInstanceEditsDb(edit: (db: RawDb) => void) {
      const db = JSON.parse((await inner.readDatabaseJson()) ?? "{}") as RawDb;
      edit(db);
      await inner.writeDatabaseJson(JSON.stringify(db, null, 2));
    },
    async otherInstanceEditsCare(edit: (care: RawCare) => void) {
      const care = JSON.parse((await inner.readCareJson()) ?? "{}") as RawCare;
      edit(care);
      await inner.writeCareJson(JSON.stringify(care, null, 2));
    },
  };
}

type RawUser = Record<string, unknown> & { id: string; email: string };
type RawDb = {
  users: RawUser[];
  machines: Array<{ id: string; name?: string }>;
  partLifecycle?: unknown[];
  dataMigrations?: { demoTenantV1?: number };
  manuals?: Array<{ id: string }>;
  tickets?: Array<{ id: string }>;
};
type RawCare = { manuals?: Array<{ id: string }>; tickets?: Array<{ id: string }> };

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

function buyerRow(machineIds: string[]) {
  return {
    id: "live-demo-buyer",
    email: DEMO_TENANT_BUYER.email,
    passwordHash: "live-hash-unchanged",
    role: "customer",
    tenantId: T,
    siteIds: ["site-cargill-ftw", "site-cargill-wichita"],
    machineIds,
    name: DEMO_TENANT_BUYER.name,
    sessionStamp: 4,
  };
}

function baseCatalog(overrides: Partial<RawDb> & Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

let store: ReturnType<typeof racingStore>;

async function start(catalog: Record<string, unknown>) {
  process.env.SPARES_ALLOW_SEED = "false";
  delete process.env.SPARES_DATA_DIR;
  delete process.env.VERCEL;
  store = racingStore();
  setPersistenceForTests(store.persistence);
  resetStoreMemoryForTests();
  await store.inner.writeDatabaseJson(JSON.stringify(catalog, null, 2));
  resetStoreMemoryForTests();
}

describe("db.json / care.json compare-and-swap", () => {
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

  it("two concurrent writers: neither machine is lost", async () => {
    await start(baseCatalog());
    await listMachines(T);

    store.beforeWrite("database", () =>
      store.otherInstanceEditsDb((db) => {
        db.machines.push(rawMachine("other-instance", "Added by the other instance"));
      }),
    );
    const mine = await createMachine(T, { name: "Added by this request" });

    resetStoreMemoryForTests();
    const names = (await listMachines(T)).map((machine) => machine.name);
    assert.ok(names.includes("Added by this request"), "this write persisted");
    assert.ok(names.includes("Added by the other instance"), "the other write was not overwritten");
    assert.ok((await getMachine(mine.id, T)) !== null);
    const raw = await store.rawDb();
    assert.equal(raw.machines.filter((machine) => machine.id === "other-instance").length, 1);
  });

  it("two concurrent writers on the same row keep both field changes", async () => {
    await start(
      baseCatalog({
        users: [{ ...buyerRow([]), id: "cust-1", email: "cust@example.com", machineIds: [] }],
        dataMigrations: { demoTenantV1: 1 },
      }),
    );
    await listMachines(T);

    store.beforeWrite("database", () =>
      store.otherInstanceEditsDb((db) => {
        const user = db.users.find((row) => row.id === "cust-1")!;
        user.machineIds = ["line-1"];
      }),
    );
    const updated = await updatePerson("cust-1", T, { name: "Renamed by this request" });
    assert.ok("user" in updated);

    resetStoreMemoryForTests();
    const stored = (await store.rawDb()).users.find((row) => row.id === "cust-1")!;
    assert.equal(stored.name, "Renamed by this request");
    assert.deepEqual(stored.machineIds, ["line-1"], "the other instance's grant survives");
  });

  it("heal racing a user write: heal-added grant and the racing change both persist", async () => {
    await start(
      baseCatalog({
        users: [buyerRow([])],
        machines: [rawMachine("line-1", "Line 1")],
        dataMigrations: { demoTenantV1: 1 },
      }),
    );

    // The heal (demo migration) is mid-write when another instance saves a user edit.
    store.beforeWrite("database", () =>
      store.otherInstanceEditsDb((db) => {
        db.machines.push(rawMachine("racer-machine", "Racer machine"));
        const buyer = db.users.find((row) => row.id === "live-demo-buyer")!;
        buyer.name = "Renamed by a racing write";
      }),
    );
    await listMachines(T);

    resetStoreMemoryForTests();
    const raw = await store.rawDb();
    const buyer = raw.users.find((row) => row.id === "live-demo-buyer")!;
    assert.ok((buyer.machineIds as string[]).includes(HW), "heal grant persisted");
    assert.equal(buyer.name, "Renamed by a racing write", "racing user edit persisted");
    assert.equal(buyer.passwordHash, "live-hash-unchanged");
    assert.equal(buyer.sessionStamp, 4);
    assert.ok(raw.machines.some((machine) => machine.id === "racer-machine"));
    assert.ok(raw.machines.some((machine) => machine.id === HW));
    assert.ok((raw.partLifecycle?.length ?? 0) >= 2);
    assert.ok((await findUserByEmail(DEMO_TENANT_BUYER.email))?.machineIds?.includes(HW));
  });

  it("a stale user write cannot overwrite a field a heal or other instance just changed", async () => {
    await start(
      baseCatalog({
        users: [{ ...buyerRow([HW]), id: "cust-2", email: "buyer2@example.com" }],
        machines: [rawMachine("line-1", "Line 1"), rawMachine(HW, "Hardware")],
        dataMigrations: { demoTenantV1: 1 },
      }),
    );
    await listMachines(T);

    store.beforeWrite("database", () =>
      store.otherInstanceEditsDb((db) => {
        const user = db.users.find((row) => row.id === "cust-2")!;
        user.machineIds = [HW, "line-1"];
      }),
    );
    const updated = await updatePerson("cust-2", T, { name: "Stale snapshot rename" });
    assert.ok("user" in updated);

    const stored = (await store.rawDb()).users.find((row) => row.id === "cust-2")!;
    assert.equal(stored.name, "Stale snapshot rename");
    assert.deepEqual([...(stored.machineIds as string[])].sort(), ["line-1", HW].sort());
  });

  it("care.json writers do not erase each other", async () => {
    await start(baseCatalog());
    await listMachines(T);

    store.beforeWrite("care", () =>
      store.otherInstanceEditsCare((care) => {
        care.tickets = [
          ...(care.tickets ?? []),
          {
            id: "ticket-from-other-instance",
            number: 77,
            machineId: "line-1",
            title: "Other instance ticket",
            status: "open",
            createdAt: "2021-01-01T00:00:00.000Z",
            customerId: "c",
            customerEmail: "c@example.com",
            tenantId: T,
            activities: [],
            lastReadAt: {},
          },
        ] as never;
      }),
    );
    const created = await createTicket(T, {
      machineId: "line-1",
      title: "My ticket",
      customerId: "c",
      customerEmail: "c@example.com",
      actor: { email: "c@example.com", role: "customer", id: "c" },
    });
    assert.ok("ticket" in created);

    const careIds = (await store.rawCare()).tickets?.map((ticket) => ticket.id) ?? [];
    assert.ok(careIds.includes("ticket-from-other-instance"));
    assert.ok(careIds.includes(created.ticket!.id));
    const dbIds = (await store.rawDb()).tickets?.map((ticket) => ticket.id) ?? [];
    assert.ok(dbIds.includes("ticket-from-other-instance"));
    assert.ok(dbIds.includes(created.ticket!.id));
  });

  it("manuals: concurrent uploads from two instances both persist", async () => {
    await start(baseCatalog());
    await listMachines(T);

    store.beforeWrite("database", () =>
      store.otherInstanceEditsDb((db) => {
        db.manuals = [
          ...(db.manuals ?? []),
          {
            id: "manual-other",
            machineId: "line-1",
            title: "Other manual",
            category: "operation",
            storedFileName: "other.pdf",
            originalFileName: "other.pdf",
            contentType: "application/pdf",
            uploadedAt: "2021-01-01T00:00:00.000Z",
            uploadedByEmail: "x@example.com",
            tenantId: T,
          },
        ] as never;
      }),
    );
    const mine = await createManual(T, {
      machineId: "line-1",
      title: "Mine",
      category: "operation",
      storedFileName: "mine.pdf",
      originalFileName: "mine.pdf",
      contentType: "application/pdf",
      uploadedByEmail: "y@example.com",
    });
    assert.ok("manual" in mine);
    const ids = (await store.rawDb()).manuals?.map((manual) => manual.id) ?? [];
    assert.ok(ids.includes("manual-other"));
    assert.ok(ids.includes(mine.manual!.id));
  });

  it("gives up with a conflict error after bounded retries and never clobbers the blob", async () => {
    await start(baseCatalog());
    await listMachines(T);
    let injected = 0;

    store.beforeWrite(
      "database",
      async () => {
        injected += 1;
        await store.otherInstanceEditsDb((db) => {
          db.machines.push(rawMachine(`churn-${injected}`, `Churn ${injected}`));
        });
      },
      1000,
    );
    await assert.rejects(
      () => createMachine(T, { name: "Never lands" }),
      CatalogWriteConflictError,
    );
    assert.ok(injected >= 2 && injected < 50, `retries are bounded (saw ${injected})`);
    const raw = await store.rawDb();
    assert.ok(!raw.machines.some((machine) => machine.name === "Never lands"));
    assert.equal(raw.machines.filter((machine) => machine.id.startsWith("churn-")).length, injected);
  });
});
