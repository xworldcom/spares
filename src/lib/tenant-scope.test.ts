import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { signSession, verifySession } from "./auth/session-token.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createMachine,
  createTenant,
  createTenantStaffUser,
  getMachine,
  listMachines,
  resetStoreMemoryForTests,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";
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
});
