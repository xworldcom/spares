import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { hashPassword, verifyPassword } from "./auth/password.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createTenantStaffUser,
  createTenantWithOptionalStaff,
  resolveMicrosoftCatalogUser,
  resetStoreMemoryForTests,
  updateTenantPlatformMeta,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const SHAPE_TID = "11111111-2222-4333-8444-555555555555";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-sso-provision-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("Microsoft SSO domain provision", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("creates staff on the host that enrolled the domain", async () => {
    await isolated();
    const created = await createTenantWithOptionalStaff("Shape", undefined, {
      ssoDomains: ["shape.com"],
      ssoTenantIds: [SHAPE_TID],
      ssoAutoroute: true,
    });
    assert.ok("tenant" in created);
    if (!("tenant" in created)) {
      return;
    }

    const first = await resolveMicrosoftCatalogUser("Jane@Shape.com");
    assert.ok("user" in first);
    if (!("user" in first)) {
      return;
    }
    assert.equal(first.user.email, "jane@shape.com");
    assert.equal(first.user.role, "staff");
    assert.equal(first.user.tenantId, created.tenant.id);
    assert.equal(first.user.staffCreatedTenantId, created.tenant.id);
    assert.ok(first.user.ssoProvisionedAt);
    assert.equal(first.provisioned, true);
    assert.equal(await verifyPassword("anything-long-enough", first.user.passwordHash), false);

    const again = await resolveMicrosoftCatalogUser("jane@shape.com");
    assert.ok("user" in again);
    if (!("user" in again)) {
      return;
    }
    assert.equal(again.user.id, first.user.id);
    assert.equal(again.provisioned, false);
  });

  it("does not move an existing login to another host", async () => {
    await isolated();
    const shape = await createTenantWithOptionalStaff("Shape", undefined, {
      ssoDomains: ["shape.com"],
      ssoTenantIds: [SHAPE_TID],
      ssoAutoroute: true,
    });
    assert.ok("tenant" in shape);
    const existing = await createTenantStaffUser(DEFAULT_TENANT_ID, {
      email: "pat@shape.com",
      passwordHash: await hashPassword("ExistingStaff1!"),
      role: "staff",
    });
    assert.ok("user" in existing);

    const resolved = await resolveMicrosoftCatalogUser("pat@shape.com");
    assert.ok("user" in resolved);
    if (!("user" in resolved) || !("user" in existing) || !("tenant" in shape)) {
      return;
    }
    assert.equal(resolved.user.id, existing.user.id);
    assert.equal(resolved.user.tenantId, DEFAULT_TENANT_ID);
    assert.notEqual(resolved.user.tenantId, shape.tenant.id);
  });

  it("does not autoroute when the host switch is off", async () => {
    await isolated();
    const created = await createTenantWithOptionalStaff("Shape", undefined, {
      ssoDomains: ["shape.com"],
      ssoTenantIds: [SHAPE_TID],
      ssoAutoroute: false,
    });
    assert.ok("tenant" in created);
    assert.deepEqual(await resolveMicrosoftCatalogUser("jane@shape.com"), {
      error: "unknown",
    });
    if (!("tenant" in created)) {
      return;
    }
    const enabled = await updateTenantPlatformMeta(created.tenant.id, {
      ssoAutoroute: true,
    });
    assert.ok("tenant" in enabled);
    const first = await resolveMicrosoftCatalogUser("jane@shape.com");
    assert.ok("user" in first);
    if (!("user" in first)) {
      return;
    }
    assert.equal(first.user.tenantId, created.tenant.id);
  });

  it("denies unknown domains and public inboxes", async () => {
    await isolated();
    await createTenantWithOptionalStaff("Shape", undefined, {
      ssoDomains: ["shape.com"],
      ssoTenantIds: [SHAPE_TID],
      ssoAutoroute: true,
    });
    assert.deepEqual(await resolveMicrosoftCatalogUser("pat@other.com"), {
      error: "unknown",
    });
    assert.deepEqual(await resolveMicrosoftCatalogUser("pat@gmail.com"), {
      error: "unknown",
    });
  });

  it("refuses autoroute until a domain and an Entra tenant id are enrolled", async () => {
    await isolated();
    const created = await createTenantWithOptionalStaff("Shape", undefined, {
      ssoDomains: ["shape.com"],
    });
    assert.ok("tenant" in created);
    if (!("tenant" in created)) {
      return;
    }
    assert.deepEqual(
      await updateTenantPlatformMeta(created.tenant.id, { ssoAutoroute: true }),
      { error: "autoroute-needs-enrollment" },
    );
    assert.deepEqual(
      await createTenantWithOptionalStaff("Other Co", undefined, {
        ssoTenantIds: [SHAPE_TID],
        ssoAutoroute: true,
      }),
      { error: "autoroute-needs-enrollment" },
    );
    const enrolled = await updateTenantPlatformMeta(created.tenant.id, {
      ssoTenantIds: [SHAPE_TID],
      ssoAutoroute: true,
    });
    assert.ok("tenant" in enrolled);
    if (!("tenant" in enrolled)) {
      return;
    }
    assert.deepEqual(enrolled.tenant.ssoTenantIds, [SHAPE_TID]);
    assert.equal(enrolled.tenant.ssoAutoroute, true);
    const cleared = await updateTenantPlatformMeta(created.tenant.id, {
      ssoTenantIds: [],
      ssoAutoroute: false,
    });
    assert.ok("tenant" in cleared);
    if (!("tenant" in cleared)) {
      return;
    }
    assert.equal("ssoTenantIds" in cleared.tenant, false);
    assert.equal("ssoAutoroute" in cleared.tenant, false);
  });

  it("refuses a second host claiming the same domain", async () => {
    await isolated();
    const first = await createTenantWithOptionalStaff("Shape", undefined, {
      ssoDomains: ["shape.com"],
    });
    assert.ok("tenant" in first);
    const second = await createTenantWithOptionalStaff("Other Co", undefined, {
      ssoDomains: ["shape.com"],
    });
    assert.deepEqual(second, { error: "domain-taken" });

    if (!("tenant" in first)) {
      return;
    }
    const clash = await updateTenantPlatformMeta(DEFAULT_TENANT_ID, {
      ssoDomains: ["shape.com"],
    });
    assert.deepEqual(clash, { error: "domain-taken" });
  });

  it("does not provision into a suspended host", async () => {
    await isolated();
    const created = await createTenantWithOptionalStaff("Shape", undefined, {
      ssoDomains: ["shape.com"],
      ssoTenantIds: [SHAPE_TID],
      ssoAutoroute: true,
    });
    assert.ok("tenant" in created);
    if (!("tenant" in created)) {
      return;
    }
    const suspended = await updateTenantPlatformMeta(created.tenant.id, {
      inactive: true,
    });
    assert.ok("tenant" in suspended);
    assert.deepEqual(await resolveMicrosoftCatalogUser("ops@shape.com"), {
      error: "unknown",
    });
  });
});
