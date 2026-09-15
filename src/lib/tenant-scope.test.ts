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
  getMachine,
  listMachines,
  resetStoreMemoryForTests,
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
});
