import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { hashPassword, verifyPassword } from "./auth/password.ts";
import { isDemoSeedLoginBlocked } from "./demo-seed-gate.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import { resolveStaffCreateTenantId } from "./staff-create-scope.ts";
import {
  createCustomer,
  createTenantStaffUser,
  findUserByEmail,
  resetStoreMemoryForTests,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-real-acct-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  process.env.VERCEL = "1";
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("real accounts (no demo seeds)", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
    delete process.env.VERCEL;
  });

  it("creates staff and customer logins that verify passwords", async () => {
    await isolated();
    const staffPassword = "RealStaffPass1!";
    const staff = await createTenantStaffUser(DEFAULT_TENANT_ID, {
      email: "ops@customer-company.test",
      passwordHash: await hashPassword(staffPassword),
      role: "staff",
    });
    assert.ok("user" in staff);
    const loadedStaff = await findUserByEmail("ops@customer-company.test");
    assert.ok(loadedStaff);
    assert.equal(loadedStaff?.tenantId, DEFAULT_TENANT_ID);
    assert.equal(await verifyPassword(staffPassword, loadedStaff!.passwordHash), true);

    const customerPassword = "RealBuyerPass1!";
    const customer = await createCustomer(
      DEFAULT_TENANT_ID,
      "buyer@customer-company.test",
      await hashPassword(customerPassword),
    );
    assert.ok("user" in customer);
    const loadedCustomer = await findUserByEmail("buyer@customer-company.test");
    assert.ok(loadedCustomer);
    assert.equal(loadedCustomer?.role, "customer");
    assert.equal(await verifyPassword(customerPassword, loadedCustomer!.passwordHash), true);
    assert.equal(isDemoSeedLoginBlocked("staff@spares.local"), true);
  });

  it("denies cross-tenant staff assignment unless platform owner", () => {
    assert.deepEqual(
      resolveStaffCreateTenantId({
        sessionTenantId: DEFAULT_TENANT_ID,
        requestedTenantId: "tenant-other",
        platformOwner: false,
      }),
      { error: "forbidden" },
    );
  });

  it("rejects staff creation when the target company does not exist", async () => {
    await isolated();
    const result = await createTenantStaffUser("tenant-missing", {
      email: "orphan@customer-company.test",
      passwordHash: await hashPassword("OrphanStaff1!"),
      role: "staff",
    });
    assert.ok("error" in result);
    assert.equal(result.error, "bad-tenant");
  });
});
