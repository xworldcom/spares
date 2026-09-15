import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { hashPassword } from "./auth/password.ts";
import { signSession, verifySession } from "./auth/session-token.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import { authorizeStaffTeamPost } from "./staff-team-guard.ts";
import {
  createTenant,
  createTenantStaffUser,
  findUserByEmail,
  resetStoreMemoryForTests,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-host-session-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("host staff login session tenant (Quinn PR128)", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
    delete process.env.SPARES_OWNER_EMAIL;
    delete process.env.SPARES_PLATFORM_OWNER_EMAILS;
  });

  it("host-created staff stays on host through heal and login session", async () => {
    await isolated();
    const satellite = await createTenant("Satellite Co");
    assert.ok("tenant" in satellite);
    const satelliteId = satellite.tenant.id;

    const email = "qa-staff-host5-pr128@example.com";
    const password = "HostStaffPass1!";
    const created = await createTenantStaffUser(DEFAULT_TENANT_ID, {
      email,
      passwordHash: await hashPassword(password),
      role: "staff",
    });
    assert.ok("user" in created);
    assert.equal(created.user.tenantId, DEFAULT_TENANT_ID);

    const loaded = await findUserByEmail(email);
    assert.ok(loaded);
    assert.equal(
      loaded?.tenantId,
      DEFAULT_TENANT_ID,
      "catalog heal must not move host staff to a satellite",
    );

    const token = signSession(loaded!.id, loaded!.email, loaded!.tenantId);
    const session = verifySession(token);
    assert.ok(session);
    assert.equal(session?.tenantId, DEFAULT_TENANT_ID);

    const foreignPost = authorizeStaffTeamPost({
      actorTenantId: DEFAULT_TENANT_ID,
      actorEmail: email,
      sessionTenantId: DEFAULT_TENANT_ID,
      requestedTenantId: satelliteId,
    });
    assert.deepEqual(foreignPost, { ok: false, reason: "forbidden" });

    const ownPost = authorizeStaffTeamPost({
      actorTenantId: DEFAULT_TENANT_ID,
      actorEmail: email,
      sessionTenantId: DEFAULT_TENANT_ID,
    });
    assert.deepEqual(ownPost, { ok: true, tenantId: DEFAULT_TENANT_ID });
  });
});
