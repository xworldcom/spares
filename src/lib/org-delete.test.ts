import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createCustomerAccount,
  createSite,
  deleteCustomerAccount,
  deleteSite,
  listCustomerAccounts,
  listSites,
  resetStoreMemoryForTests,
  SEED_CUSTOMER_ACCOUNTS,
  SEED_SITES,
  updateSite,
  writeCatalogHealForTests,
} from "./store.ts";

const SEED_NOW = "2020-01-01T00:00:00.000Z";

function seedOrgDb() {
  return {
    schemaVersion: 2,
    customers: [...SEED_CUSTOMER_ACCOUNTS],
    sites: [...SEED_SITES],
    users: [
      {
        id: "user-staff",
        email: "staff@spares.local",
        passwordHash: "x",
        role: "staff" as const,
      },
    ],
    machines: [
      {
        id: "palletizer",
        name: "Palletizer",
        storedFileName: "palletizer.glb",
        originalFileName: "palletizer.glb",
        parts: [],
        unmatched: [],
        createdAt: SEED_NOW,
        siteId: "site-cargill-ftw",
      },
    ],
    quotes: [],
    bugReports: [],
    manuals: [],
    tickets: [],
    machineUsage: [],
  };
}

describe("org delete persistence", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("keeps a soft-deleted site out of staff lists after catalog heal", async () => {
    process.env.SPARES_ALLOW_SEED = "true";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(JSON.stringify(seedOrgDb()));

    const removed = await deleteSite("site-cargill-wichita");
    assert.equal("ok" in removed, true);

    resetStoreMemoryForTests();
    const sites = await listSites("customer-cargill");
    assert.equal(
      sites.some((site) => site.id === "site-cargill-wichita"),
      false,
    );

    const raw = JSON.parse((await persistence.readDatabaseJson()) ?? "{}") as {
      sites?: Array<{ id: string; deletedAt?: string }>;
    };
    const tombstone = raw.sites?.find((site) => site.id === "site-cargill-wichita");
    assert.ok(tombstone?.deletedAt);
  });

  it("does not resurrect a seed site after soft delete", async () => {
    process.env.SPARES_ALLOW_SEED = "true";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(JSON.stringify(seedOrgDb()));

    await deleteSite("site-cargill-wichita");
    resetStoreMemoryForTests();
    const sites = await listSites("customer-cargill");
    assert.equal(sites.length, 1);
    assert.equal(sites[0]?.id, "site-cargill-ftw");
  });

  it("blocks site delete when machines are still assigned", async () => {
    process.env.SPARES_ALLOW_SEED = "false";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(JSON.stringify(seedOrgDb()));

    const blocked = await deleteSite("site-cargill-ftw");
    assert.equal("error" in blocked && blocked.error, "has-machines");
  });

  it("keeps a soft-deleted customer out of staff lists after catalog heal", async () => {
    process.env.SPARES_ALLOW_SEED = "true";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(JSON.stringify(seedOrgDb()));

    await deleteSite("site-demo-plant1");
    const removed = await deleteCustomerAccount("customer-demo");
    assert.equal("ok" in removed, true);

    resetStoreMemoryForTests();
    const accounts = await listCustomerAccounts();
    assert.equal(accounts.some((row) => row.id === "customer-demo"), false);

    const demoSites = await listSites("customer-demo");
    assert.equal(demoSites.length, 0);
  });

  it("blocks customer delete while sites remain", async () => {
    process.env.SPARES_ALLOW_SEED = "false";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(JSON.stringify(seedOrgDb()));

    const blocked = await deleteCustomerAccount("customer-cargill");
    assert.equal("error" in blocked && blocked.error, "has-sites");
  });

  it("deletes a custom customer with no sites", async () => {
    process.env.SPARES_ALLOW_SEED = "false";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(
      JSON.stringify({
        ...seedOrgDb(),
        customers: [],
        sites: [],
      }),
    );

    const created = await createCustomerAccount("Temp Corp");
    assert.ok("account" in created);

    const removed = await deleteCustomerAccount(created.account.id);
    assert.equal("ok" in removed, true);

    resetStoreMemoryForTests();
    const accounts = await listCustomerAccounts();
    assert.equal(accounts.some((row) => row.id === created.account.id), false);
  });

  it("does not undo a soft delete when a stale catalog heal writes afterward", async () => {
    process.env.SPARES_ALLOW_SEED = "false";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(
      JSON.stringify({
        ...seedOrgDb(),
        customers: [],
        sites: [],
      }),
    );

    const created = await createCustomerAccount("Smoke Throwaway Customer");
    assert.ok("account" in created);
    const customerId = created.account.id;

    const createdSite = await createSite(customerId, "Smoke Site");
    assert.ok("site" in createdSite);
    await updateSite(createdSite.site.id, { name: "Smoke Site Edited" });

    const staleHealSnapshot = JSON.parse((await persistence.readDatabaseJson()) ?? "{}");
    resetStoreMemoryForTests();

    await deleteSite(createdSite.site.id);
    await deleteCustomerAccount(customerId);

    resetStoreMemoryForTests();
    await writeCatalogHealForTests(staleHealSnapshot);

    resetStoreMemoryForTests();
    const accounts = await listCustomerAccounts();
    assert.equal(accounts.some((row) => row.id === customerId), false);
    const sites = await listSites(customerId);
    assert.equal(sites.length, 0);
  });
});

describe("seed access heal", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("clears stale companyAccess and restores fixture machine sites for customer@", async () => {
    process.env.SPARES_ALLOW_SEED = "true";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(
      JSON.stringify({
        ...seedOrgDb(),
        users: [
          ...seedOrgDb().users,
          {
            id: "user-customer",
            email: "customer@spares.local",
            passwordHash: "x",
            role: "customer" as const,
            siteIds: ["site-cargill-ftw"],
            companyAccess: ["Acme"],
          },
        ],
        machines: [
          {
            id: "palletizer",
            name: "Palletizer",
            storedFileName: "palletizer.glb",
            originalFileName: "palletizer.glb",
            parts: [],
            unmatched: [],
            createdAt: SEED_NOW,
            siteId: "site-cargill-ftw",
          },
          {
            id: "hardware-fixture",
            name: "Hardware fixture",
            storedFileName: "hardware-fixture.glb",
            originalFileName: "hardware-fixture.glb",
            parts: [],
            unmatched: [],
            createdAt: SEED_NOW,
            siteId: "site-cargill-ftw",
          },
        ],
      }),
    );

    resetStoreMemoryForTests();
    const { findUserById, listMachines } = await import("./store.ts");
    const { canAccessMachine } = await import("./access.ts");
    const { getOrgContext } = await import("./store.ts");

    await listMachines();
    const user = await findUserById("user-customer");
    assert.ok(user);
    assert.deepEqual(user?.siteIds, ["site-cargill-ftw"]);
    assert.equal(user?.companyAccess, undefined);

    const org = await getOrgContext();
    const machines = await listMachines();
    const hardware = machines.find((row) => row.id === "hardware-fixture");
    assert.equal(hardware?.siteId, "site-acme-dayton");

    const customer = {
      role: "customer" as const,
      siteIds: user?.siteIds ?? [],
      machineIds: user?.machineIds ?? [],
      companyAccess: user?.companyAccess,
    };
    assert.equal(
      canAccessMachine(
        customer,
        { id: "palletizer", siteId: "site-cargill-ftw" },
        org.sites,
        org.customers,
      ),
      true,
    );
    assert.equal(
      canAccessMachine(
        customer,
        { id: "hardware-fixture", siteId: "site-acme-dayton" },
        org.sites,
        org.customers,
      ),
      false,
    );
  });

  it("resets demo customer@ when the grant would expose hardware fixture", async () => {
    process.env.SPARES_ALLOW_SEED = "true";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(
      JSON.stringify({
        ...seedOrgDb(),
        users: [
          ...seedOrgDb().users,
          {
            id: "user-customer",
            email: "customer@spares.local",
            passwordHash: "x",
            role: "customer" as const,
            siteIds: ["site-cargill-ftw"],
            machineIds: ["hardware-fixture"],
          },
        ],
        machines: [
          {
            id: "palletizer",
            name: "Palletizer",
            storedFileName: "palletizer.glb",
            originalFileName: "palletizer.glb",
            parts: [],
            unmatched: [],
            createdAt: SEED_NOW,
            siteId: "site-cargill-ftw",
          },
          {
            id: "hardware-fixture",
            name: "Hardware fixture",
            storedFileName: "hardware-fixture.glb",
            originalFileName: "hardware-fixture.glb",
            parts: [],
            unmatched: [],
            createdAt: SEED_NOW,
            siteId: "site-acme-dayton",
          },
        ],
      }),
    );

    resetStoreMemoryForTests();
    const { findUserById, listMachines } = await import("./store.ts");
    await listMachines();
    const user = await findUserById("user-customer");
    assert.deepEqual(user?.siteIds, []);
    assert.deepEqual(user?.machineIds, ["palletizer"]);
  });

  it("forces seed demo users back to customer role", async () => {
    process.env.SPARES_ALLOW_SEED = "true";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(
      JSON.stringify({
        ...seedOrgDb(),
        users: [
          ...seedOrgDb().users,
          {
            id: "user-customer",
            email: "customer@spares.local",
            passwordHash: "x",
            role: "staff" as const,
            siteIds: ["site-cargill-ftw"],
          },
        ],
      }),
    );

    resetStoreMemoryForTests();
    const { findUserById, listMachines } = await import("./store.ts");
    await listMachines();
    const user = await findUserById("user-customer");
    assert.equal(user?.role, "customer");
  });
});
