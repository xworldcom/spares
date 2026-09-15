import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { hashPassword } from "./auth/password.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import { authorizeStaffTeamPost } from "./staff-team-guard.ts";
import {
  createTenant,
  createTenantStaffUser,
  findUserByEmail,
  resetStoreMemoryForTests,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const HOST = DEFAULT_TENANT_ID;
const SATELLITE = "tenant-3b2926cb-7d5d-458b-a8c6-a3ce32a9c31d";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-staff-post-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("POST /api/staff/team authorization + store (Quinn PR128)", () => {
  const envKeys = [
    "SPARES_OWNER_EMAIL",
    "SPARES_PLATFORM_OWNER_EMAILS",
    "SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS",
  ] as const;
  const previous: Record<string, string | undefined> = {};

  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
    for (const key of envKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  function previewQaEnv() {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    process.env.SPARES_OWNER_EMAIL = "qa-staff-pr128@example.com";
    process.env.SPARES_PLATFORM_OWNER_EMAILS =
      "qa-staff-pr128@example.com,kevin@huzevka.com";
  }

  it("foreign tenantId → forbidden and no staff row is created", async () => {
    previewQaEnv();
    await isolated();
    await createTenant("Satellite Co");

    const authz = authorizeStaffTeamPost({
      actorTenantId: HOST,
      actorEmail: "qa-staff-pr128@example.com",
      sessionTenantId: HOST,
      requestedTenantId: SATELLITE,
    });
    assert.deepEqual(authz, { ok: false, reason: "forbidden" });

    const before = await findUserByEmail("intruder-staff@test");
    assert.equal(before, null);
  });

  it("same-tenant create still succeeds after authz", async () => {
    previewQaEnv();
    await isolated();

    const authz = authorizeStaffTeamPost({
      actorTenantId: HOST,
      actorEmail: "qa-staff-pr128@example.com",
      sessionTenantId: HOST,
    });
    assert.deepEqual(authz, { ok: true, tenantId: HOST });

    const created = await createTenantStaffUser(authz.tenantId, {
      email: "new-host-staff@test",
      passwordHash: await hashPassword("ValidStaffPass1!"),
      role: "staff",
    });
    assert.ok("user" in created);
    assert.equal(created.user.tenantId, HOST);
  });

  it("kevin may authorize cross-tenant create on satellite", async () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    process.env.SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS = "kevin@huzevka.com";
    delete process.env.SPARES_OWNER_EMAIL;

    const authz = authorizeStaffTeamPost({
      actorTenantId: HOST,
      actorEmail: "kevin@huzevka.com",
      sessionTenantId: HOST,
      requestedTenantId: SATELLITE,
    });
    assert.deepEqual(authz, { ok: true, tenantId: SATELLITE });
  });
});
