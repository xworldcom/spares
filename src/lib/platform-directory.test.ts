import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  buildPlatformDirectory,
  filterDirectoryEntries,
  type DirectoryEntry,
} from "./platform-directory.ts";
import { setPersistenceForTests } from "./persistence.ts";
import {
  createCustomer,
  createCustomerAccount,
  createTenantWithOptionalStaff,
  listPlatformDirectory,
  resetStoreMemoryForTests,
  updateTenantPlatformMeta,
} from "./store.ts";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME, defaultTenantRecord } from "./tenant.ts";
import { hashPassword } from "./auth/password.ts";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-directory-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

function ofType(entries: readonly DirectoryEntry[], type: DirectoryEntry["type"]) {
  return entries.filter((entry) => entry.type === type);
}

describe("platform directory", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("builds a flat cross-host list with a host column on every row", () => {
    const host = defaultTenantRecord();
    const satellite = {
      id: "tenant-acme",
      name: "Acme Automation",
      slug: "acme-automation",
      createdAt: "2026-01-01T00:00:00.000Z",
      inactiveAt: "2026-02-01T00:00:00.000Z",
    };
    const entries = buildPlatformDirectory({
      tenants: [host, satellite],
      customers: [
        {
          id: "cust-1",
          name: "Plastics Co",
          createdAt: "2026-01-02T00:00:00.000Z",
          tenantId: satellite.id,
        },
        // Legacy row without tenantId belongs to the Soft Launch host.
        { id: "cust-2", name: "Host Legacy Co", createdAt: "2026-01-03T00:00:00.000Z" },
        {
          id: "cust-3",
          name: "Deleted Co",
          createdAt: "2026-01-04T00:00:00.000Z",
          tenantId: satellite.id,
          deletedAt: "2026-01-05T00:00:00.000Z",
        },
      ],
      users: [
        {
          id: "user-1",
          email: "operator@plastics.test",
          name: "Olive Operator",
          role: "customer",
          tenantId: satellite.id,
        },
        { id: "user-2", email: "kevin-customer@host.test", role: "customer" },
        {
          id: "user-3",
          email: "staff@acme.test",
          role: "staff",
          tenantId: satellite.id,
        },
        {
          id: "user-4",
          email: "gone@acme.test",
          role: "customer",
          tenantId: satellite.id,
          deletedAt: "2026-01-06T00:00:00.000Z",
        },
      ],
    });

    const hosts = ofType(entries, "host");
    assert.deepEqual(
      hosts.map((row) => [row.name, row.suspended]),
      [
        ["Acme Automation", true],
        [DEFAULT_TENANT_NAME, false],
      ],
    );

    const customers = ofType(entries, "customer");
    assert.deepEqual(
      customers.map((row) => [row.name, row.hostName]),
      [
        ["Host Legacy Co", DEFAULT_TENANT_NAME],
        ["Plastics Co", "Acme Automation"],
      ],
    );

    const people = ofType(entries, "person");
    assert.deepEqual(
      people.map((row) => [row.name, row.email, row.hostId]),
      [
        ["kevin-customer@host.test", "kevin-customer@host.test", DEFAULT_TENANT_ID],
        ["Olive Operator", "operator@plastics.test", "tenant-acme"],
      ],
    );
    // Staff logins are managed per host, never listed as directory people.
    assert.equal(
      entries.some((row) => row.email === "staff@acme.test"),
      false,
    );
  });

  it("filters by type and free-text query across name, email, and host", () => {
    const entries: DirectoryEntry[] = [
      {
        type: "host",
        id: "tenant-acme",
        name: "Acme Automation",
        hostId: "tenant-acme",
        hostName: "Acme Automation",
      },
      {
        type: "customer",
        id: "cust-1",
        name: "Plastics Co",
        hostId: "tenant-acme",
        hostName: "Acme Automation",
      },
      {
        type: "person",
        id: "user-1",
        name: "Olive Operator",
        email: "olive@plastics.test",
        hostId: "tenant-acme",
        hostName: "Acme Automation",
      },
    ];

    assert.equal(filterDirectoryEntries(entries, { type: "all" }).length, 3);
    assert.deepEqual(
      filterDirectoryEntries(entries, { type: "customer" }).map((row) => row.id),
      ["cust-1"],
    );
    assert.deepEqual(
      filterDirectoryEntries(entries, { query: "olive@" }).map((row) => row.id),
      ["user-1"],
    );
    // Host name matches every row on that host.
    assert.equal(filterDirectoryEntries(entries, { query: "acme" }).length, 3);
    assert.deepEqual(
      filterDirectoryEntries(entries, { type: "person", query: "acme" }).map(
        (row) => row.id,
      ),
      ["user-1"],
    );
  });

  it("store directory spans hosts and keeps rows isolated to their own host", async () => {
    await isolated();
    const created = await createTenantWithOptionalStaff("Directory Co", {
      email: "dir-staff@test",
      passwordHash: await hashPassword("password-1"),
    });
    assert.ok("tenant" in created);
    const satelliteId = created.tenant.id;

    const hostAccount = await createCustomerAccount("Host Customer", DEFAULT_TENANT_ID);
    assert.ok("account" in hostAccount);
    const satelliteAccount = await createCustomerAccount(
      "Satellite Customer",
      satelliteId,
    );
    assert.ok("account" in satelliteAccount);

    const person = await createCustomer(
      satelliteId,
      "person@satellite.test",
      await hashPassword("password-2"),
      { name: "Satellite Person" },
    );
    assert.ok("user" in person);

    const entries = await listPlatformDirectory();

    const satelliteRows = entries.filter((row) => row.hostId === satelliteId);
    assert.deepEqual(
      satelliteRows.map((row) => [row.type, row.name]).sort(),
      [
        ["customer", "Satellite Customer"],
        ["host", "Directory Co"],
        ["person", "Satellite Person"],
      ],
    );

    const hostRows = entries.filter((row) => row.hostId === DEFAULT_TENANT_ID);
    assert.equal(
      hostRows.some((row) => row.type === "customer" && row.name === "Host Customer"),
      true,
    );
    assert.equal(
      hostRows.some((row) => row.name === "Satellite Person"),
      false,
    );
    // Staff created with the tenant never leaks into the directory as a person.
    assert.equal(
      entries.some((row) => row.email === "dir-staff@test"),
      false,
    );
  });

  it("suspends satellites but never the Soft Launch host", async () => {
    await isolated();
    const created = await createTenantWithOptionalStaff("Suspend Co");
    assert.ok("tenant" in created);

    const suspended = await updateTenantPlatformMeta(created.tenant.id, {
      inactive: true,
    });
    assert.ok("tenant" in suspended);
    assert.equal(Boolean(suspended.tenant.inactiveAt), true);

    const entries = await listPlatformDirectory();
    const row = entries.find(
      (entry) => entry.type === "host" && entry.id === created.tenant.id,
    );
    assert.ok(row);
    assert.equal(row.suspended, true);

    const reactivated = await updateTenantPlatformMeta(created.tenant.id, {
      inactive: false,
    });
    assert.ok("tenant" in reactivated);
    assert.equal(reactivated.tenant.inactiveAt, undefined);

    const hostAttempt = await updateTenantPlatformMeta(DEFAULT_TENANT_ID, {
      inactive: true,
    });
    assert.deepEqual(hostAttempt, { error: "host-immutable" });
  });
});
