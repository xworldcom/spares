import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  canAssignStaffAcrossTenants,
  crossTenantStaffAdminEmails,
} from "./tenant.ts";

describe("cross-tenant staff admin emails", () => {
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

  it("does not treat SPARES_OWNER_EMAIL alone as cross-tenant staff admin (Preview QA)", () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    delete process.env.SPARES_PLATFORM_OWNER_EMAILS;
    process.env.SPARES_OWNER_EMAIL = "qa-staff-pr128@example.com";

    assert.equal(canAssignStaffAcrossTenants("qa-staff-pr128@example.com"), false);
    assert.equal(canAssignStaffAcrossTenants("kevin@huzevka.com"), true);
  });

  it("honors SPARES_PLATFORM_OWNER_EMAILS when set", () => {
    for (const key of envKeys) {
      previous[key] = process.env[key];
    }
    process.env.SPARES_PLATFORM_OWNER_EMAILS = "owner@test,sibling@test";
    process.env.SPARES_OWNER_EMAIL = "qa-staff-pr128@example.com";

    assert.deepEqual([...crossTenantStaffAdminEmails()].sort(), ["owner@test", "sibling@test"]);
    assert.equal(canAssignStaffAcrossTenants("owner@test"), true);
    assert.equal(canAssignStaffAcrossTenants("qa-staff-pr128@example.com"), false);
  });
});
