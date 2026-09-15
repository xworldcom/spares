import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { resolveStaffTeamPostTenant } from "./staff-team-guard.ts";

const HOST = "tenant-oee360-host";
const SATELLITE = "tenant-3b2926cb-7d5d-458b-a8c6-a3ce32a9c31d";

describe("POST /api/staff/team tenant resolution (route contract)", () => {
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

  function previewQaEnv() {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    delete process.env.SPARES_PLATFORM_OWNER_EMAILS;
    process.env.SPARES_OWNER_EMAIL = "qa-staff-pr128@example.com";
  }

  it("Quinn: qa-staff on host + foreign tenantId → forbidden", () => {
    previewQaEnv();
    assert.deepEqual(
      resolveStaffTeamPostTenant({
        actorTenantId: HOST,
        actorEmail: "qa-staff-pr128@example.com",
        requestedTenantId: SATELLITE,
      }),
      { ok: false, reason: "forbidden" },
    );
  });

  it("Quinn: qa-staff same-tenant (omit tenantId) → host", () => {
    previewQaEnv();
    assert.deepEqual(
      resolveStaffTeamPostTenant({
        actorTenantId: HOST,
        actorEmail: "qa-staff-pr128@example.com",
      }),
      { ok: true, tenantId: HOST },
    );
  });

  it("platform owner list may create on satellite", () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    process.env.SPARES_PLATFORM_OWNER_EMAILS = "kevin@huzevka.com";

    assert.deepEqual(
      resolveStaffTeamPostTenant({
        actorTenantId: HOST,
        actorEmail: "kevin@huzevka.com",
        requestedTenantId: SATELLITE,
      }),
      { ok: true, tenantId: SATELLITE },
    );
  });
});
