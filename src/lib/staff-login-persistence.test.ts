import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { hashPassword, verifyPassword } from "./auth/password.ts";
import {
  createMemoryPersistence,
  PersistenceReadError,
  setPersistenceForTests,
  type Persistence,
} from "./persistence.ts";
import {
  CatalogUnreadableError,
  createCustomer,
  createTenant,
  createTenantStaffUser,
  deletePerson,
  deleteStaffUser,
  findUserByEmail,
  listPlatformDirectory,
  listMachines,
  listStaffUsersForPlatform,
  recordMachineView,
  resetStoreMemoryForTests,
  SEED_CUSTOMER,
  SEED_STAFF,
  updateTenantPlatformMeta,
} from "./store.ts";
import { DEFAULT_TENANT_ID, effectiveStaffTenantId } from "./tenant.ts";

const HOST = DEFAULT_TENANT_ID;
/** Kevin's real Soft Launch staff login (not a demo fixture). */
const KEVIN_STAFF = "ops@jmp-solutions.test";
const KEVIN_STAFF_PASSWORD = "KevinOpsPass1!";

type Harness = {
  persistence: Persistence;
  /** Fail the next database reads the way a rate-limited or dropped Blob read does. */
  failNextReads(times: number): void;
  /** Serve one stale snapshot, like another instance that read before our write landed. */
  serveStaleRead(json: string): void;
  raw(): Promise<string | null>;
};

function harness(): Harness {
  const inner = createMemoryPersistence();
  let failReads = 0;
  let staleJson: string | null = null;
  const persistence: Persistence = {
    ...inner,
    // Pretend to be the remote backend so process memory is never trusted.
    kind: "blob",
    async readDatabaseJson() {
      if (failReads > 0) {
        failReads -= 1;
        throw new PersistenceReadError("spares/db.json");
      }
      if (staleJson !== null) {
        const stale = staleJson;
        staleJson = null;
        return stale;
      }
      return inner.readDatabaseJson();
    },
  };
  return {
    persistence,
    failNextReads(times) {
      failReads = times;
    },
    serveStaleRead(json) {
      staleJson = json;
    },
    raw() {
      return inner.readDatabaseJson();
    },
  };
}

function machineRow(id: string, name: string) {
  return {
    id,
    name,
    storedFileName: `${id}.glb`,
    originalFileName: `${id}.glb`,
    parts: [],
    unmatched: [],
    createdAt: "2020-01-01T00:00:00.000Z",
    tenantId: HOST,
  };
}

function softLaunchDb(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    tenants: [
      {
        id: HOST,
        name: "OEE360 Host",
        slug: "oee360-host",
        createdAt: "2020-01-01T00:00:00.000Z",
      },
    ],
    customers: [],
    sites: [],
    users: [],
    machines: [machineRow("kevin-line-1", "Kevin line 1")],
    quotes: [],
    bugReports: [],
    manuals: [],
    tickets: [],
    machineUsage: [],
    ...overrides,
  };
}

async function storedUsers(store: Harness) {
  const raw = JSON.parse((await store.raw()) ?? "{}") as {
    users?: Array<{ id: string; email: string; deletedAt?: string }>;
  };
  return raw.users ?? [];
}

async function createKevinStaff() {
  return createTenantStaffUser(HOST, {
    email: KEVIN_STAFF,
    passwordHash: await hashPassword(KEVIN_STAFF_PASSWORD),
    role: "staff",
  });
}

const envKeys = [
  "SPARES_ALLOW_SEED",
  "SPARES_DATA_DIR",
  "SPARES_OWNER_EMAIL",
  "SPARES_OWNER_PASSWORD",
  "VERCEL",
] as const;
const previous: Record<string, string | undefined> = {};
for (const key of envKeys) {
  previous[key] = process.env[key];
}

let store: Harness;

async function softLaunch(options?: { seed?: boolean; db?: Record<string, unknown> }) {
  process.env.SPARES_ALLOW_SEED = options?.seed === false ? "false" : "true";
  delete process.env.SPARES_DATA_DIR;
  delete process.env.SPARES_OWNER_EMAIL;
  delete process.env.SPARES_OWNER_PASSWORD;
  delete process.env.VERCEL;
  store = harness();
  setPersistenceForTests(store.persistence);
  resetStoreMemoryForTests();
  await store.persistence.writeDatabaseJson(
    JSON.stringify(options?.db ?? softLaunchDb()),
  );
  resetStoreMemoryForTests();
  return store;
}

describe("staff logins survive heals, races, and storage hiccups", () => {
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

  it("a failed catalog read never reseeds over Kevin's staff", async () => {
    await softLaunch();
    const created = await createKevinStaff();
    assert.ok("user" in created);

    resetStoreMemoryForTests();
    store.failNextReads(1);
    await assert.rejects(() => findUserByEmail(KEVIN_STAFF), PersistenceReadError);

    // The stored catalog is untouched, so the login works again once Blob recovers.
    resetStoreMemoryForTests();
    const users = await storedUsers(store);
    assert.ok(users.some((user) => user.email === KEVIN_STAFF));
    const loaded = await findUserByEmail(KEVIN_STAFF);
    assert.ok(loaded);
    assert.equal(await verifyPassword(KEVIN_STAFF_PASSWORD, loaded!.passwordHash), true);
    const machines = await listMachines(HOST);
    assert.ok(machines.some((row) => row.id === "kevin-line-1"));
  });

  it("unreadable catalog JSON is reported, not replaced with fixtures", async () => {
    await softLaunch();
    const created = await createKevinStaff();
    assert.ok("user" in created);
    await store.persistence.writeDatabaseJson("{ this is not catalog json");
    resetStoreMemoryForTests();

    await assert.rejects(() => findUserByEmail(KEVIN_STAFF), CatalogUnreadableError);
    assert.equal(await store.raw(), "{ this is not catalog json");
  });

  it("a catalog with no users keeps machines instead of reseeding from scratch", async () => {
    await softLaunch({
      seed: false,
      db: softLaunchDb({
        users: [],
        machines: [machineRow("kevin-line-1", "Kevin line 1")],
      }),
    });

    const machines = await listMachines(HOST);
    assert.ok(machines.some((row) => row.id === "kevin-line-1"));

    const created = await createKevinStaff();
    assert.ok("user" in created);
    resetStoreMemoryForTests();
    const again = await listMachines(HOST);
    assert.ok(again.some((row) => row.id === "kevin-line-1"));
    assert.ok(await findUserByEmail(KEVIN_STAFF));
  });

  it("an unrelated write from a stale snapshot cannot drop a new staff login", async () => {
    await softLaunch();
    const staleSnapshot = (await store.raw()) ?? "{}";

    const created = await createKevinStaff();
    assert.ok("user" in created);

    // Another instance opened a machine before the staff create landed.
    resetStoreMemoryForTests();
    store.serveStaleRead(staleSnapshot);
    await recordMachineView({
      userId: "user-viewer",
      email: "viewer@jmp-solutions.test",
      machineId: "kevin-line-1",
      tenantId: HOST,
    });

    resetStoreMemoryForTests();
    assert.ok((await storedUsers(store)).some((user) => user.email === KEVIN_STAFF));
    const staff = await listStaffUsersForPlatform();
    assert.ok(staff.some((row) => row.email === KEVIN_STAFF));
    assert.ok(await findUserByEmail(KEVIN_STAFF));
  });

  it("renaming the Soft Launch host to JMP keeps its staff and customer people", async () => {
    await softLaunch();
    const created = await createKevinStaff();
    assert.ok("user" in created);
    const person = await createCustomer(
      HOST,
      "buyer@jmp-solutions.test",
      await hashPassword("KevinBuyerPass1!"),
    );
    assert.ok("user" in person);
    const staleSnapshot = (await store.raw()) ?? "{}";

    resetStoreMemoryForTests();
    const renamed = await updateTenantPlatformMeta(HOST, { name: "JMP" });
    assert.ok("tenant" in renamed);
    assert.equal(renamed.tenant.name, "JMP");

    resetStoreMemoryForTests();
    const staff = await findUserByEmail(KEVIN_STAFF);
    assert.ok(staff);
    assert.equal(effectiveStaffTenantId(staff!), HOST);
    const directory = await listPlatformDirectory();
    const staffRow = directory.find((row) => row.email === KEVIN_STAFF);
    assert.equal(staffRow?.type, "staff");
    assert.equal(staffRow?.hostId, HOST);
    assert.equal(staffRow?.hostName, "JMP");
    assert.ok(
      directory.some(
        (row) => row.type === "person" && row.email === "buyer@jmp-solutions.test",
      ),
    );

    // A rename built from a pre-create snapshot must not roll the people back either.
    resetStoreMemoryForTests();
    store.serveStaleRead(staleSnapshot);
    const again = await updateTenantPlatformMeta(HOST, { name: "JMP Solutions" });
    assert.ok("tenant" in again);
    resetStoreMemoryForTests();
    const emails = (await storedUsers(store)).map((user) => user.email);
    assert.ok(emails.includes(KEVIN_STAFF));
    assert.ok(emails.includes("buyer@jmp-solutions.test"));
  });

  it("a satellite host created by another instance is not erased by a host write", async () => {
    await softLaunch();
    const staleSnapshot = (await store.raw()) ?? "{}";
    const satellite = await createTenant("Satellite Co");
    assert.ok("tenant" in satellite);
    const satelliteStaff = await createTenantStaffUser(satellite.tenant.id, {
      email: "ops@satellite.test",
      passwordHash: await hashPassword("SatellitePass1!"),
      role: "staff",
    });
    assert.ok("user" in satelliteStaff);

    resetStoreMemoryForTests();
    store.serveStaleRead(staleSnapshot);
    await updateTenantPlatformMeta(HOST, { name: "JMP" });

    resetStoreMemoryForTests();
    const staff = await listStaffUsersForPlatform();
    const row = staff.find((entry) => entry.email === "ops@satellite.test");
    assert.equal(row?.tenantId, satellite.tenant.id);
    assert.equal(row?.tenantName, "Satellite Co");
  });

  it("a concurrent create of the same address is refused instead of duplicated", async () => {
    await softLaunch();
    const staleSnapshot = (await store.raw()) ?? "{}";
    const first = await createKevinStaff();
    assert.ok("user" in first);

    resetStoreMemoryForTests();
    store.serveStaleRead(staleSnapshot);
    const second = await createKevinStaff();
    assert.ok("error" in second);
    assert.equal(second.error, "email-taken");

    resetStoreMemoryForTests();
    const live = (await storedUsers(store)).filter(
      (user) => user.email === KEVIN_STAFF && !user.deletedAt,
    );
    assert.equal(live.length, 1);
    assert.ok(await findUserByEmail(KEVIN_STAFF));
  });
});

describe("demo seed logins on Preview", () => {
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

  it("re-adds staff@spares.local to Directory without touching Kevin's staff", async () => {
    await softLaunch();
    const created = await createKevinStaff();
    assert.ok("user" in created);
    const kevinHash = created.user.passwordHash;

    resetStoreMemoryForTests();
    const directory = await listPlatformDirectory();
    const demo = directory.find((row) => row.email === SEED_STAFF.email);
    assert.equal(demo?.type, "staff");
    assert.equal(demo?.hostId, HOST);
    assert.ok(directory.some((row) => row.email === SEED_CUSTOMER.email));

    const demoStaff = await findUserByEmail(SEED_STAFF.email);
    assert.ok(demoStaff);
    assert.equal(await verifyPassword(SEED_STAFF.password, demoStaff!.passwordHash), true);

    const kevin = await findUserByEmail(KEVIN_STAFF);
    assert.equal(kevin?.id, created.user.id);
    assert.equal(kevin?.passwordHash, kevinHash);
  });

  it("restores staff@spares.local after a deactivate landed in stored data", async () => {
    await softLaunch({
      db: softLaunchDb({
        users: [
          {
            id: SEED_STAFF.id,
            email: SEED_STAFF.email,
            passwordHash: "stale",
            role: "staff",
            tenantId: HOST,
            staffCreatedTenantId: HOST,
            deletedAt: "2026-09-01T00:00:00.000Z",
          },
        ],
      }),
    });

    const demo = await findUserByEmail(SEED_STAFF.email);
    assert.ok(demo, "demo staff should be live again");
    assert.equal(demo?.deletedAt, undefined);

    const blocked = await deleteStaffUser(SEED_STAFF.id, HOST);
    assert.ok("error" in blocked);
    assert.equal(blocked.error, "protected");
  });

  it("refuses to deactivate customer@spares.local while seeds are on", async () => {
    await softLaunch();
    resetStoreMemoryForTests();
    const seeded = await findUserByEmail(SEED_CUSTOMER.email);
    assert.ok(seeded);

    const blocked = await deletePerson(seeded!.id, HOST);
    assert.ok("error" in blocked);
    assert.equal(blocked.error, "protected");
  });

  it("does not add demo logins when seeds are off", async () => {
    await softLaunch({ seed: false });
    const created = await createKevinStaff();
    assert.ok("user" in created);

    resetStoreMemoryForTests();
    const emails = (await storedUsers(store)).map((user) => user.email);
    assert.deepEqual(emails, [KEVIN_STAFF]);
    assert.equal(await findUserByEmail(SEED_STAFF.email), null);
  });
});
