import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { effectiveStaffTenantId } from "./tenant.ts";

describe("effectiveStaffTenantId", () => {
  const envKeys = ["SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS"] as const;
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

  it("pins Tess host staff to create-time host tenant despite heal drift", () => {
    delete process.env.SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS;
    assert.equal(
      effectiveStaffTenantId({
        role: "staff",
        email: "qa-staff-host5-pr128@example.com",
        tenantId: "tenant-satellite-drift",
        staffCreatedTenantId: "tenant-oee360-host",
      }),
      "tenant-oee360-host",
    );
  });

  it("kevin cross-tenant admin uses stored tenantId when no pin", () => {
    delete process.env.SPARES_CROSS_TENANT_STAFF_ADMIN_EMAILS;
    assert.equal(
      effectiveStaffTenantId({
        role: "staff",
        email: "kevin@huzevka.com",
        tenantId: "tenant-satellite",
      }),
      "tenant-satellite",
    );
  });
});
