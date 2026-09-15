import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { signSession, verifySession } from "./auth/session-token.ts";
import { canAccessMachine } from "./access.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createMachine,
  createTenant,
  createTenantStaffUser,
  createTenantWithOptionalStaff,
  findUserByEmail,
  getMachine,
  listMachines,
  listTenants,
  resetStoreMemoryForTests,
  writeCatalogHealForTests,
} from "./store.ts";
import { DEFAULT_TENANT_ID, tenantIdForUser } from "./tenant.ts";
import { hashPassword } from "./auth/password.ts";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-tenant-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("tenant isolation", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("denies cross-tenant machine reads", async () => {
    await isolated();
    const other = await createTenant("Other Host Co");
    assert.ok("tenant" in other);
    if (!("tenant" in other)) {
      return;
    }
    const staff = await createTenantStaffUser(other.tenant.id, {
      email: "staff@other.test",
      passwordHash: await hashPassword("pass"),
      role: "staff",
    });
    assert.ok("user" in staff);

    const machine = await createMachine(DEFAULT_TENANT_ID, {
      name: "Tenant one line",
      storedFileName: "t1.glb",
      originalFileName: "t1.glb",
      parts: [],
      unmatched: [],
    });

    const visibleDefault = await listMachines(DEFAULT_TENANT_ID);
    assert.ok(visibleDefault.some((row) => row.id === machine.id));

    const visibleOther = await listMachines(other.tenant.id);
    assert.equal(visibleOther.some((row) => row.id === machine.id), false);
    assert.equal(await getMachine(machine.id, other.tenant.id), null);
  });

  it("carries tenantId in signed session payload", () => {
    const token = signSession("user-1", "kevin@huzevka.com", DEFAULT_TENANT_ID);
    const session = verifySession(token);
    assert.ok(session);
    assert.equal(session?.tenantId, DEFAULT_TENANT_ID);
  });

  it("does not default missing user tenantId to the host tenant", () => {
    assert.equal(tenantIdForUser({ tenantId: undefined }), null);
    assert.equal(tenantIdForUser({}), null);
    assert.equal(tenantIdForUser({ tenantId: "tenant-b" }), "tenant-b");
  });

  it("staff cannot access host machines when scoped to another tenant", () => {
    const hostMachine = {
      id: "m-host",
      tenantId: DEFAULT_TENANT_ID,
      siteId: null,
    };
    const allowed = canAccessMachine(
      { role: "staff", tenantId: "tenant-b" },
      hostMachine,
    );
    assert.equal(allowed, false);
    const deniedWithoutTenant = canAccessMachine({ role: "staff" }, hostMachine);
    assert.equal(deniedWithoutTenant, false);
  });

  it("rejects duplicate staff email across tenants", async () => {
    await isolated();
    const first = await createTenantStaffUser(DEFAULT_TENANT_ID, {
      email: "dup@test",
      passwordHash: await hashPassword("pass"),
      role: "staff",
    });
    assert.ok("user" in first);
    const other = await createTenant("Dup Email Co");
    assert.ok("tenant" in other);
    if (!("tenant" in other)) {
      return;
    }
    const second = await createTenantStaffUser(other.tenant.id, {
      email: "dup@test",
      passwordHash: await hashPassword("pass2"),
      role: "staff",
    });
    assert.ok("error" in second);
    assert.equal(second.error, "email-taken");
  });

  it("assigns first staff to the new tenant id in one write", async () => {
    await isolated();
    const created = await createTenantWithOptionalStaff("Company B", {
      email: "companyb-staff@test",
      passwordHash: await hashPassword("pass"),
    });
    assert.ok("tenant" in created);
    if (!("tenant" in created)) {
      return;
    }
    assert.ok(created.staffUser);
    assert.equal(created.staffUser?.tenantId, created.tenant.id);
    assert.notEqual(created.staffUser?.tenantId, DEFAULT_TENANT_ID);

    const loaded = await findUserByEmail("companyb-staff@test");
    assert.equal(loaded?.tenantId, created.tenant.id);

    const hostMachines = await createMachine(DEFAULT_TENANT_ID, {
      name: "Host only",
      storedFileName: "host.glb",
      originalFileName: "host.glb",
      parts: [],
      unmatched: [],
    });
    assert.ok(hostMachines.id);
    const bMachines = await listMachines(created.tenant.id);
    assert.equal(bMachines.length, 0);
  });

  it("keeps a new tenant and staff tenantId when a stale catalog heal runs afterward", async () => {
    await isolated();
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(
      JSON.stringify({
        schemaVersion: 3,
        tenants: [
          {
            id: DEFAULT_TENANT_ID,
            name: "OEE360 Host",
            slug: "oee360-host",
            createdAt: "2020-01-01T00:00:00.000Z",
          },
        ],
        users: [
          {
            id: "user-staff",
            email: "staff@spares.local",
            passwordHash: "x",
            role: "staff" as const,
            tenantId: DEFAULT_TENANT_ID,
          },
        ],
        machines: [],
        quotes: [],
        bugReports: [],
        sites: [],
      }),
    );

    const staleHeal = JSON.parse((await persistence.readDatabaseJson()) ?? "{}");
    resetStoreMemoryForTests();

    const created = await createTenantWithOptionalStaff("Company B", {
      email: "companyb-staff@test",
      passwordHash: await hashPassword("pass"),
    });
    assert.ok("tenant" in created);
    if (!("tenant" in created)) {
      return;
    }

    resetStoreMemoryForTests();
    await writeCatalogHealForTests(staleHeal);

    resetStoreMemoryForTests();
    const tenants = await listTenants();
    assert.ok(tenants.some((row) => row.id === created.tenant.id));
    const loaded = await findUserByEmail("companyb-staff@test");
    assert.equal(loaded?.tenantId, created.tenant.id);
    assert.notEqual(loaded?.tenantId, DEFAULT_TENANT_ID);
  });

  it("persists satellite staff tenantId repairs to blob", async () => {
    await isolated();
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    await persistence.writeDatabaseJson(
      JSON.stringify({
        schemaVersion: 3,
        tenants: [
          {
            id: DEFAULT_TENANT_ID,
            name: "OEE360 Host",
            slug: "oee360-host",
            createdAt: "2020-01-01T00:00:00.000Z",
          },
          {
            id: "tenant-b",
            name: "Company B",
            slug: "company-b",
            createdAt: "2025-06-01T00:00:00.000Z",
            bootstrapStaffEmail: "companyb-staff@test",
          },
        ],
        users: [
          {
            id: "user-b",
            email: "companyb-staff@test",
            passwordHash: "x",
            role: "staff" as const,
            tenantId: DEFAULT_TENANT_ID,
          },
        ],
        machines: [],
        quotes: [],
        bugReports: [],
        sites: [],
      }),
    );

    resetStoreMemoryForTests();
    const loaded = await findUserByEmail("companyb-staff@test");
    assert.equal(loaded?.tenantId, "tenant-b");

    resetStoreMemoryForTests();
    const raw = JSON.parse((await persistence.readDatabaseJson()) ?? "{}");
    assert.equal(raw.users?.[0]?.tenantId, "tenant-b");
  });
});
