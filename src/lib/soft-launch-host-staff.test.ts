import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { canAccessMachine } from "./access.ts";
import { hashPassword } from "./auth/password.ts";
import { signSession, verifySession } from "./auth/session-token.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import { authorizeStaffTeamPost } from "./staff-team-guard.ts";
import {
  createTenant,
  createTenantStaffUser,
  findUserByEmail,
  getOrgContext,
  listMachines,
  resetStoreMemoryForTests,
} from "./store.ts";
import { canAssignStaffAcrossTenants, DEFAULT_TENANT_ID } from "./tenant.ts";

const HOST = DEFAULT_TENANT_ID;
const HOST_STAFF = "qa-staff-host4-pr128@example.com";

async function softLaunchPreview() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-soft-launch-host-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "true";
  delete process.env.VERCEL;
  delete process.env.SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS;
  process.env.SPARES_PLATFORM_OWNER_EMAILS = `${HOST_STAFF},kevin@huzevka.com`;
  process.env.SPARES_OWNER_EMAIL = HOST_STAFF;
  setPersistenceForTests(createMemoryPersistence());
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("Soft Launch host staff (Quinn CoS)", () => {
  const envKeys = [
    "SPARES_DATA_DIR",
    "SPARES_ALLOW_SEED",
    "SPARES_OWNER_EMAIL",
    "SPARES_PLATFORM_OWNER_EMAILS",
    "SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS",
  ] as const;
  const previous: Record<string, string | undefined> = {};

  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    for (const key of envKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it("login session stays on host and /machines catalog is visible", async () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    await softLaunchPreview();
    const satellite = await createTenant("Satellite Co");
    assert.ok("tenant" in satellite);

    const created = await createTenantStaffUser(HOST, {
      email: HOST_STAFF,
      passwordHash: await hashPassword("HostStaffPass1!"),
      role: "staff",
    });
    assert.ok("user" in created);

    const loaded = await findUserByEmail(HOST_STAFF);
    assert.ok(loaded);
    assert.equal(loaded?.tenantId, HOST);

    const token = signSession(loaded!.id, loaded!.email, loaded!.tenantId);
    assert.equal(verifySession(token)?.tenantId, HOST);

    const machines = await listMachines(HOST);
    const names = machines.map((row) => row.id);
    assert.ok(
      names.includes("hardware-fixture") && names.includes("palletizer"),
      "expected Soft Launch host seed machines",
    );

    const org = await getOrgContext(HOST);
    const visible = machines.filter((machine) =>
      canAccessMachine({ role: "staff", tenantId: HOST }, machine, org.sites, org.customers),
    );
    assert.equal(visible.length, machines.length);
    assert.ok(visible.length >= 2);
  });

  it("host staff POST foreign satellite tenantId → 403 even when in PLATFORM_OWNER_EMAILS", async () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    await softLaunchPreview();
    const satellite = await createTenant("Satellite Co");
    assert.ok("tenant" in satellite);

    assert.equal(canAssignStaffAcrossTenants(HOST_STAFF), false);

    const authz = authorizeStaffTeamPost({
      actorTenantId: HOST,
      actorEmail: HOST_STAFF,
      sessionTenantId: HOST,
      requestedTenantId: satellite.tenant.id,
    });
    assert.deepEqual(authz, { ok: false, reason: "forbidden" });
  });
});
