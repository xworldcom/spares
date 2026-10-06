import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { hashPassword } from "./auth/password.ts";
import { canAccessPlatformAdmin } from "./platform-admin.ts";
import {
  mapCreateTenantStoreError,
  parseCreatePlatformTenantBody,
} from "./platform-tenant-create.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createTenantWithOptionalStaff,
  findUserByEmail,
  listPlatformDeployments,
  listTenants,
  resetStoreMemoryForTests,
} from "./store.ts";
import { tenantDeploymentKind } from "./platform-metrics.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-platform-create-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("parseCreatePlatformTenantBody", () => {
  it("requires company name", () => {
    const result = parseCreatePlatformTenantBody({ name: "  " });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.status, 400);
  });

  it("requires password when staff email is set", () => {
    const result = parseCreatePlatformTenantBody({
      name: "Acme",
      staffEmail: "ops@acme.com",
    });
    assert.equal(result.ok, false);
  });

  it("requires email when staff password is set", () => {
    const result = parseCreatePlatformTenantBody({
      name: "Acme",
      staffPassword: "ValidStaffPass1!",
    });
    assert.equal(result.ok, false);
  });

  it("enforces staff password policy", () => {
    const result = parseCreatePlatformTenantBody({
      name: "Acme",
      staffEmail: "ops@acme.com",
      staffPassword: "short",
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.status, 400);
  });

  it("accepts an optional SSO domain list", () => {
    const result = parseCreatePlatformTenantBody({
      name: "Shape",
      ssoDomains: "Shape.com, shapetech.com",
    });
    assert.deepEqual(result, {
      ok: true,
      value: { name: "Shape", ssoDomains: ["shape.com", "shapetech.com"] },
    });
  });

  it("accepts an autoroute off/on flag", () => {
    const result = parseCreatePlatformTenantBody({
      name: "Shape",
      ssoDomains: "shape.com",
      ssoAutoroute: "on",
    });
    assert.deepEqual(result, {
      ok: true,
      value: { name: "Shape", ssoDomains: ["shape.com"], ssoAutoroute: true },
    });
  });

  it("rejects a public SSO domain", () => {
    const result = parseCreatePlatformTenantBody({
      name: "Shape",
      ssoDomains: "gmail.com",
    });
    assert.equal(result.ok, false);
  });

  it("accepts an Entra tenant id list", () => {
    const result = parseCreatePlatformTenantBody({
      name: "Shape",
      ssoDomains: "shape.com",
      ssoTenantIds: "11111111-2222-4333-8444-555555555555, AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
      ssoAutoroute: "on",
    });
    assert.deepEqual(result, {
      ok: true,
      value: {
        name: "Shape",
        ssoDomains: ["shape.com"],
        ssoTenantIds: [
          "11111111-2222-4333-8444-555555555555",
          "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        ],
        ssoAutoroute: true,
      },
    });
  });

  it("rejects a malformed Entra tenant id", () => {
    const result = parseCreatePlatformTenantBody({
      name: "Shape",
      ssoTenantIds: "shape.com",
    });
    assert.deepEqual(result, {
      ok: false,
      message: "Enter an Entra tenant ID such as 11111111-2222-3333-4444-555555555555",
      status: 400,
    });
  });
});

describe("platform host tenant create + persist", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
    delete process.env.SPARES_PLATFORM_OWNER_EMAILS;
  });

  it("limits create to platform owner emails", () => {
    process.env.SPARES_PLATFORM_OWNER_EMAILS = "owner@example.com";
    assert.equal(canAccessPlatformAdmin("owner@example.com"), true);
    assert.equal(canAccessPlatformAdmin("staff@other.com"), false);
  });

  it("creates satellite tenant, persists, and stamps first staff tenantId", async () => {
    await isolated();
    const created = await createTenantWithOptionalStaff("Acme Automation", {
      email: "ops@acme-automation.com",
      passwordHash: await hashPassword("ValidStaffPass1!"),
    });
    assert.ok("tenant" in created);
    if (!("tenant" in created)) {
      return;
    }
    assert.notEqual(created.tenant.id, DEFAULT_TENANT_ID);
    assert.equal(tenantDeploymentKind(created.tenant.id), "satellite");
    assert.ok(created.staffUser);
    assert.equal(created.staffUser?.tenantId, created.tenant.id);
    assert.equal(created.staffUser?.staffCreatedTenantId, created.tenant.id);

    resetStoreMemoryForTests();
    const tenants = await listTenants();
    assert.ok(tenants.some((row) => row.id === created.tenant.id));

    const deployments = await listPlatformDeployments();
    const row = deployments.find((d) => d.tenant.id === created.tenant.id);
    assert.ok(row);
    assert.equal(row.kind, "satellite");
    assert.equal(row.size.staffUsers, 1);

    const loaded = await findUserByEmail("ops@acme-automation.com");
    assert.equal(loaded?.tenantId, created.tenant.id);
  });

  it("maps duplicate tenant and email errors", () => {
    assert.equal(mapCreateTenantStoreError("taken").status, 409);
    assert.equal(mapCreateTenantStoreError("email-taken").status, 409);
    assert.equal(mapCreateTenantStoreError("domain-taken").status, 409);
    assert.equal(mapCreateTenantStoreError("local-part-taken").status, 409);
    assert.deepEqual(mapCreateTenantStoreError("autoroute-needs-enrollment"), {
      message: "Turn on autoroute after enrolling at least one work domain and one Entra tenant ID",
      status: 400,
    });
  });
});
