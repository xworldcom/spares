import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { DEMO_TENANT_BUYER } from "./demo-tenant-data-migration.ts";
import { setPersistenceForTests } from "./persistence.ts";
import { FIXTURE_MACHINE_IDS } from "./seed-fixtures.ts";
import {
  findUserByEmail,
  getMachine,
  listMachines,
  resetStoreMemoryForTests,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const T = DEFAULT_TENANT_ID;
const HW = FIXTURE_MACHINE_IDS.hardware;
const previousSeed = process.env.SPARES_ALLOW_SEED;

after(() => {
  if (previousSeed === undefined) {
    delete process.env.SPARES_ALLOW_SEED;
  } else {
    process.env.SPARES_ALLOW_SEED = previousSeed;
  }
});

async function liveLikeStore() {
  process.env.SPARES_ALLOW_SEED = "false";
  const dir = await mkdtemp(path.join(tmpdir(), "spares-high3-"));
  process.env.SPARES_DATA_DIR = dir;
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  await listMachines(T);
  resetStoreMemoryForTests();
  return path.join(dir, "db.json");
}

type RawDb = {
  users: Array<Record<string, unknown>>;
  machines: Array<{ id: string }>;
  partLifecycle?: unknown[];
  dataMigrations?: { demoTenantV1?: number };
};

async function editDb(file: string, edit: (db: RawDb) => void) {
  const db = JSON.parse(await readFile(file, "utf8")) as RawDb;
  edit(db);
  await writeFile(file, JSON.stringify(db, null, 2));
  resetStoreMemoryForTests();
}

function buyerRow(machineIds: string[]) {
  return {
    id: "live-demo-buyer",
    email: DEMO_TENANT_BUYER.email,
    passwordHash: "live-hash-unchanged",
    role: "customer",
    tenantId: T,
    siteIds: [],
    machineIds: machineIds.length > 0 ? machineIds : [HW],
    name: DEMO_TENANT_BUYER.name,
    sessionStamp: 4,
  };
}

async function buyerState() {
  const buyer = await findUserByEmail(DEMO_TENANT_BUYER.email);
  assert.ok(buyer);
  return buyer;
}

describe("HIGH 3 live regression: hardware-fixture grant survives persistence", () => {
  it("keeps the buyer grant after the migrating heal writes the catalog (fresh read)", async () => {
    const file = await liveLikeStore();
    await editDb(file, (db) => {
      db.users.push(buyerRow([]));
      db.machines = db.machines.filter((machine) => machine.id !== HW);
      db.partLifecycle = [];
      delete db.dataMigrations;
    });

    await listMachines(T);
    resetStoreMemoryForTests();

    const buyer = await buyerState();
    assert.ok(buyer.machineIds?.includes(HW), "grant must be durable, not request-local");
    assert.equal(buyer.passwordHash, "live-hash-unchanged");
    assert.equal(buyer.sessionStamp, 4);
    assert.ok(await getMachine(HW, T));
  });

  it("re-applies missing pieces when the marker is set but machine, lifecycle, and grant are gone", async () => {
    const file = await liveLikeStore();
    await editDb(file, (db) => {
      db.users.push(buyerRow([]));
      db.machines = db.machines.filter((machine) => machine.id !== HW);
      db.partLifecycle = [];
      db.dataMigrations = { demoTenantV1: 1 };
    });

    await listMachines(T);
    resetStoreMemoryForTests();

    const buyer = await buyerState();
    assert.ok(buyer.machineIds?.includes(HW));
    assert.ok(await getMachine(HW, T));
    const raw = JSON.parse(await readFile(file, "utf8")) as RawDb;
    assert.ok((raw.partLifecycle?.length ?? 0) >= 2);
    assert.equal(buyer.passwordHash, "live-hash-unchanged");
  });

  it("re-grants when only the grant is missing and does not create a missing buyer", async () => {
    const file = await liveLikeStore();
    await editDb(file, (db) => {
      db.users.push(buyerRow([]));
      db.dataMigrations = { demoTenantV1: 1 };
    });
    await listMachines(T);
    resetStoreMemoryForTests();
    assert.ok((await buyerState()).machineIds?.includes(HW));

    const emptyFile = await liveLikeStore();
    await editDb(emptyFile, (db) => {
      db.dataMigrations = { demoTenantV1: 1 };
      db.machines = db.machines.filter((machine) => machine.id !== HW);
    });
    await listMachines(T);
    resetStoreMemoryForTests();
    assert.equal(await findUserByEmail(DEMO_TENANT_BUYER.email), null);
    assert.ok(await getMachine(HW, T));
  });
});
