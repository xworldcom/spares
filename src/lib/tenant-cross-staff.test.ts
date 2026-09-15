import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  canAssignStaffAcrossTenants,
  crossTenantStaffAdminEmails,
  DEFAULT_CROSS_TENANT_STAFF_ADMIN,
} from "./tenant.ts";

describe("cross-tenant staff admin emails", () => {
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

  function saveEnv() {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
  }

  it("does not treat SPARES_OWNER_EMAIL alone as cross-tenant staff admin (Preview QA)", () => {
    saveEnv();
    delete process.env.SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS;
    delete process.env.SPARES_PLATFORM_OWNER_EMAILS;
    process.env.SPARES_OWNER_EMAIL = "qa-staff-pr128@example.com";

    assert.equal(canAssignStaffAcrossTenants("qa-staff-pr128@example.com"), false);
    assert.equal(canAssignStaffAcrossTenants(DEFAULT_CROSS_TENANT_STAFF_ADMIN), true);
  });

  it("honors SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS when set", () => {
    saveEnv();
    process.env.SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS = "owner@test,sibling@test";
    process.env.SPARES_OWNER_EMAIL = "qa-staff-pr128@example.com";

    assert.deepEqual([...crossTenantStaffAdminEmails()].sort(), ["owner@test", "sibling@test"]);
    assert.equal(canAssignStaffAcrossTenants("owner@test"), true);
    assert.equal(canAssignStaffAcrossTenants("qa-staff-pr128@example.com"), false);
  });

  it("Soft Launch: host staff listed in SPARES_PLATFORM_OWNER_EMAILS still cannot cross-create staff", () => {
    saveEnv();
    delete process.env.SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS;
    process.env.SPARES_OWNER_EMAIL = "qa-staff-host4-pr128@example.com";
    process.env.SPARES_PLATFORM_OWNER_EMAILS =
      "qa-staff-host4-pr128@example.com,kevin@huzevka.com";

    assert.equal(canAssignStaffAcrossTenants("qa-staff-host4-pr128@example.com"), false);
    assert.equal(canAssignStaffAcrossTenants("kevin@huzevka.com"), true);
  });

  it("strips bootstrap owner from explicit cross-tenant list when not Kevin", () => {
    saveEnv();
    process.env.SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS =
      "qa-staff-pr128@example.com,kevin@huzevka.com";
    process.env.SPARES_OWNER_EMAIL = "qa-staff-pr128@example.com";

    assert.equal(canAssignStaffAcrossTenants("qa-staff-pr128@example.com"), false);
    assert.equal(canAssignStaffAcrossTenants("kevin@huzevka.com"), true);
  });
});
