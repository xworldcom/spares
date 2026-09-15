import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { authorizeStaffTeamPost, resolveStaffTeamPostTenant } from "./staff-team-guard.ts";

const HOST = "tenant-oee360-host";
const SATELLITE = "tenant-3b2926cb-7d5d-458b-a8c6-a3ce32a9c31d";

describe("POST /api/staff/team tenant resolution (route contract)", () => {
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

  function previewQaEnv() {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    delete process.env.SPARES_PLATFORM_OWNER_EMAILS;
    process.env.SPARES_OWNER_EMAIL = "qa-staff-pr128@example.com";
  }

  function previewQaMirroredPlatformEnv() {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    process.env.SPARES_OWNER_EMAIL = "qa-staff-pr128@example.com";
    process.env.SPARES_PLATFORM_OWNER_EMAILS =
      "qa-staff-pr128@example.com,kevin@huzevka.com";
  }

  it("Quinn: qa-staff on host + foreign tenantId → forbidden", () => {
    previewQaEnv();
    assert.deepEqual(
      authorizeStaffTeamPost({
        actorTenantId: HOST,
        actorEmail: "qa-staff-pr128@example.com",
        sessionTenantId: HOST,
        requestedTenantId: SATELLITE,
      }),
      { ok: false, reason: "forbidden" },
    );
    assert.deepEqual(
      resolveStaffTeamPostTenant({
        actorTenantId: HOST,
        actorEmail: "qa-staff-pr128@example.com",
        requestedTenantId: SATELLITE,
      }),
      { ok: false, reason: "forbidden" },
    );
  });

  it("Quinn Preview mirror: PLATFORM_OWNER_EMAILS includes bootstrap owner → still forbidden", () => {
    previewQaMirroredPlatformEnv();
    assert.deepEqual(
      authorizeStaffTeamPost({
        actorTenantId: HOST,
        actorEmail: "qa-staff-pr128@example.com",
        sessionTenantId: HOST,
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
    process.env.SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS = "kevin@huzevka.com";

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
