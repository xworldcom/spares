import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { MicrosoftIdentity } from "./auth/microsoft.ts";
import { hashPassword, verifyPassword } from "./auth/password.ts";
import { MICROSOFT_CONSUMER_TID } from "./auth/sso-domain.ts";
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
const OTHER_TID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function identity(
  email: string,
  options: { tid?: string; oid?: string; verified?: boolean } = {},
): MicrosoftIdentity {
  return {
    tid: options.tid ?? SHAPE_TID,
    oid: options.oid ?? "oid-jane",
    emails: [{ email: email.toLowerCase(), verified: options.verified ?? true }],
  };
}

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-sso-provision-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

async function shapeHost(options: { ssoAutoroute?: boolean; ssoTenantIds?: string[] } = {}) {
  const created = await createTenantWithOptionalStaff("Shape", undefined, {
    ssoDomains: ["shape.com"],
    ssoTenantIds: options.ssoTenantIds ?? [SHAPE_TID],
    ssoAutoroute: options.ssoAutoroute ?? true,
  });
  assert.ok("tenant" in created);
  if (!("tenant" in created)) {
    throw new Error("unreachable");
  }
  return created.tenant;
}

describe("Microsoft SSO identity binding and autoroute", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("creates staff bound to tid and oid on the host that enrolled the domain and tenant", async () => {
    await isolated();
    const host = await shapeHost();

    const first = await resolveMicrosoftCatalogUser(identity("Jane@Shape.com"));
    assert.ok("user" in first);
    if (!("user" in first)) {
      return;
    }
    assert.equal(first.user.email, "jane@shape.com");
    assert.equal(first.user.role, "staff");
    assert.equal(first.user.tenantId, host.id);
    assert.equal(first.user.staffCreatedTenantId, host.id);
    assert.equal(first.user.microsoftTid, SHAPE_TID);
    assert.equal(first.user.microsoftOid, "oid-jane");
    assert.ok(first.user.ssoProvisionedAt);
    assert.equal(first.provisioned, true);
    assert.equal(await verifyPassword("anything-long-enough", first.user.passwordHash), false);

    const again = await resolveMicrosoftCatalogUser(identity("jane@shape.com"));
    assert.ok("user" in again);
    if (!("user" in again)) {
      return;
    }
    assert.equal(again.user.id, first.user.id);
    assert.equal(again.provisioned, false);
  });

  it("nOAuth: an enrolled domain with autoroute on does not route a foreign tenant", async () => {
    await isolated();
    await shapeHost();
    assert.deepEqual(
      await resolveMicrosoftCatalogUser(identity("jane@shape.com", { tid: OTHER_TID })),
      { error: "unknown" },
    );
  });

  it("does not route an enrolled tenant onto a domain it did not enroll", async () => {
    await isolated();
    await shapeHost();
    assert.deepEqual(await resolveMicrosoftCatalogUser(identity("pat@other.com")), {
      error: "unknown",
    });
    assert.deepEqual(await resolveMicrosoftCatalogUser(identity("pat@gmail.com")), {
      error: "unknown",
    });
  });

  it("never routes a personal Microsoft account", async () => {
    await isolated();
    await shapeHost();
    assert.deepEqual(
      await resolveMicrosoftCatalogUser(
        identity("jane@shape.com", { tid: MICROSOFT_CONSUMER_TID, verified: false }),
      ),
      { error: "unknown" },
    );
  });

  it("binds an existing login on a verified UPN from any tenant and keeps its host", async () => {
    await isolated();
    const shape = await shapeHost();
    const existing = await createTenantStaffUser(DEFAULT_TENANT_ID, {
      email: "pat@shape.com",
      passwordHash: await hashPassword("ExistingStaff1!"),
      role: "staff",
    });
    assert.ok("user" in existing);
    if (!("user" in existing)) {
      return;
    }

    const resolved = await resolveMicrosoftCatalogUser(
      identity("pat@shape.com", { tid: OTHER_TID, oid: "oid-pat" }),
    );
    assert.ok("user" in resolved);
    if (!("user" in resolved)) {
      return;
    }
    assert.equal(resolved.user.id, existing.user.id);
    assert.equal(resolved.user.tenantId, DEFAULT_TENANT_ID);
    assert.notEqual(resolved.user.tenantId, shape.id);
    assert.equal(resolved.user.microsoftTid, OTHER_TID);
    assert.equal(resolved.user.microsoftOid, "oid-pat");
    assert.equal(resolved.provisioned, false);

    resetStoreMemoryForTests();
    const reloaded = await resolveMicrosoftCatalogUser(
      identity("pat@shape.com", { tid: OTHER_TID, oid: "oid-pat" }),
    );
    assert.ok("user" in reloaded);
    if (!("user" in reloaded)) {
      return;
    }
    assert.equal(reloaded.user.microsoftTid, OTHER_TID);
  });

  it("ignores an unverified email claim from a tenant the login's host did not enroll", async () => {
    await isolated();
    const existing = await createTenantStaffUser(DEFAULT_TENANT_ID, {
      email: "pat@shape.com",
      passwordHash: await hashPassword("ExistingStaff1!"),
      role: "staff",
    });
    assert.ok("user" in existing);
    assert.deepEqual(
      await resolveMicrosoftCatalogUser(
        identity("pat@shape.com", { tid: OTHER_TID, verified: false }),
      ),
      { error: "unknown" },
    );
  });

  it("accepts an unverified email claim from a tenant the login's host enrolled", async () => {
    await isolated();
    const host = await shapeHost({ ssoAutoroute: false });
    const existing = await createTenantStaffUser(host.id, {
      email: "pat@shape.com",
      passwordHash: await hashPassword("ExistingStaff1!"),
      role: "staff",
    });
    assert.ok("user" in existing);
    if (!("user" in existing)) {
      return;
    }
    const resolved = await resolveMicrosoftCatalogUser(
      identity("pat@shape.com", { verified: false }),
    );
    assert.ok("user" in resolved);
    if (!("user" in resolved)) {
      return;
    }
    assert.equal(resolved.user.id, existing.user.id);
    assert.equal(resolved.user.microsoftTid, SHAPE_TID);
  });

  it("rejects a bound login presented from a different tid or oid", async () => {
    await isolated();
    await shapeHost();
    const first = await resolveMicrosoftCatalogUser(identity("jane@shape.com"));
    assert.ok("user" in first);
    assert.deepEqual(
      await resolveMicrosoftCatalogUser(identity("jane@shape.com", { oid: "oid-other" })),
      { error: "identity-mismatch" },
    );
    assert.deepEqual(
      await resolveMicrosoftCatalogUser(identity("jane@shape.com", { tid: OTHER_TID })),
      { error: "identity-mismatch" },
    );
  });

  it("does not autoroute when the host switch is off, then does once it is on", async () => {
    await isolated();
    const host = await shapeHost({ ssoAutoroute: false });
    assert.deepEqual(await resolveMicrosoftCatalogUser(identity("jane@shape.com")), {
      error: "unknown",
    });
    const enabled = await updateTenantPlatformMeta(host.id, { ssoAutoroute: true });
    assert.ok("tenant" in enabled);
    const first = await resolveMicrosoftCatalogUser(identity("jane@shape.com"));
    assert.ok("user" in first);
    if (!("user" in first)) {
      return;
    }
    assert.equal(first.user.tenantId, host.id);
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
    const host = await shapeHost();
    const suspended = await updateTenantPlatformMeta(host.id, { inactive: true });
    assert.ok("tenant" in suspended);
    assert.deepEqual(await resolveMicrosoftCatalogUser(identity("ops@shape.com")), {
      error: "unknown",
    });
  });
});
