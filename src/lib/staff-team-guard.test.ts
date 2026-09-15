import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { assertStaffTeamCreateAllowed, decideStaffTeamTenant } from "./staff-team-guard.ts";

const HOST = "tenant-oee360-host";
const SATELLITE = "tenant-3b2926cb-7d5d-458b-a8c6-a3ce32a9c31d";

describe("decideStaffTeamTenant", () => {
  const envKeys = ["SPARES_OWNER_EMAIL", "SPARES_PLATFORM_OWNER_EMAILS"] as const;
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

  it("rejects non–platform owner POST with foreign tenantId (Quinn PR128)", () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    process.env.SPARES_OWNER_EMAIL = "kevin@huzevka.com";
    process.env.SPARES_PLATFORM_OWNER_EMAILS = "kevin@huzevka.com";

    assert.deepEqual(
      decideStaffTeamTenant({
        actorTenantId: HOST,
        actorEmail: "qa-staff-pr128@example.com",
        requestedTenantId: SATELLITE,
      }),
      { ok: false, reason: "forbidden" },
    );
  });

  it("allows platform owner to target a satellite tenant", () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    process.env.SPARES_OWNER_EMAIL = "kevin@huzevka.com";

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
