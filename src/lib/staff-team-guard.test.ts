import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { assertStaffTeamCreateAllowed, decideStaffTeamTenant } from "./staff-team-guard.ts";

const HOST = "tenant-oee360-host";
const SATELLITE = "tenant-3b2926cb-7d5d-458b-a8c6-a3ce32a9c31d";

describe("decideStaffTeamTenant", () => {
  const envKeys = [
    "SPARES_OWNER_EMAIL",
    "SPARES_PLATFORM_OWNER_EMAILS",
    "SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS",
  ] as const;
  const previous: Record<string, string | undefined> = {};

  after(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it("rejects Preview QA staff when only SPARES_OWNER_EMAIL is set (Quinn PR128)", () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    delete process.env.SPARES_PLATFORM_OWNER_EMAILS;
    process.env.SPARES_OWNER_EMAIL = "qa-staff-pr128@example.com";

    assert.deepEqual(
      decideStaffTeamTenant({
        actorTenantId: HOST,
        actorEmail: "qa-staff-pr128@example.com",
        requestedTenantId: SATELLITE,
      }),
      { ok: false, reason: "forbidden" },
    );
  });

  it("allows kevin cross-tenant when SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS lists kevin", () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    process.env.SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS = "kevin@huzevka.com";

    assert.deepEqual(
      decideStaffTeamTenant({
        actorTenantId: HOST,
        actorEmail: "kevin@huzevka.com",
        requestedTenantId: SATELLITE,
      }),
      { ok: true, tenantId: SATELLITE },
    );
  });

  it("blocks assertStaffTeamCreateAllowed for cross-tenant non-owner", () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    process.env.SPARES_OWNER_EMAIL = "kevin@huzevka.com";

    assert.equal(
      assertStaffTeamCreateAllowed({
        actorTenantId: HOST,
        actorEmail: "qa-staff-pr128@example.com",
        targetTenantId: SATELLITE,
      }),
      false,
    );
  });

  it("pins non-owner creates to actor tenant when tenantId is omitted", () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    process.env.SPARES_OWNER_EMAIL = "kevin@huzevka.com";

    assert.deepEqual(
      decideStaffTeamTenant({
        actorTenantId: HOST,
        actorEmail: "qa-staff-pr128@example.com",
      }),
      { ok: true, tenantId: HOST },
    );
  });
});
