import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveStaffCreateTenantId } from "./staff-create-scope.ts";

describe("resolveStaffCreateTenantId", () => {
  it("defaults to the signed-in staff tenant", () => {
    assert.deepEqual(
      resolveStaffCreateTenantId({
        sessionTenantId: "tenant-a",
        platformOwner: false,
      }),
      { tenantId: "tenant-a" },
    );
  });

  it("denies cross-tenant assignment for non–platform owners", () => {
    assert.deepEqual(
      resolveStaffCreateTenantId({
        sessionTenantId: "tenant-a",
        requestedTenantId: "tenant-b",
        platformOwner: false,
      }),
      { error: "forbidden" },
    );
  });

  it("allows platform owners to target another tenant", () => {
    assert.deepEqual(
      resolveStaffCreateTenantId({
        sessionTenantId: "tenant-oee360-host",
        requestedTenantId: "tenant-satellite",
        platformOwner: true,
      }),
      { tenantId: "tenant-satellite" },
    );
  });
});
