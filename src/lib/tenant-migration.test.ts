import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME } from "./tenant.ts";
import { migrateTenants } from "./tenant-migration.ts";

describe("tenant migration", () => {
  it("stamps legacy rows into the default host tenant", () => {
    const { db, changed } = migrateTenants({
      schemaVersion: 2,
      users: [{ id: "u1", email: "a@test", passwordHash: "x", role: "staff" }],
      customers: [{ id: "c1", name: "Acme", createdAt: "2020-01-01T00:00:00.000Z" }],
      sites: [],
      machines: [{ id: "m1", name: "Line", storedFileName: "a.glb", originalFileName: "a.glb", parts: [], unmatched: [], createdAt: "2020-01-01T00:00:00.000Z" }],
      quotes: [],
      bugReports: [],
    });
    assert.equal(changed, true);
    assert.equal(db.schemaVersion, 3);
    assert.equal(db.tenants?.[0]?.id, DEFAULT_TENANT_ID);
    assert.equal(db.tenants?.[0]?.name, DEFAULT_TENANT_NAME);
    assert.equal(db.users?.[0]?.tenantId, DEFAULT_TENANT_ID);
    assert.equal(db.customers?.[0]?.tenantId, DEFAULT_TENANT_ID);
    assert.equal(db.machines?.[0]?.tenantId, DEFAULT_TENANT_ID);
  });

  it("backfills missing tenantId on rows without overwriting other tenants", () => {
    const { db, changed } = migrateTenants({
      schemaVersion: 3,
      tenants: [
        {
          id: DEFAULT_TENANT_ID,
          name: DEFAULT_TENANT_NAME,
          slug: "oee360-host",
          createdAt: "2020-01-01T00:00:00.000Z",
        },
        {
          id: "tenant-b",
          name: "Company B",
          slug: "company-b",
          createdAt: "2020-01-01T00:00:00.000Z",
        },
      ],
      users: [
        {
          id: "u-b",
          email: "b@test",
          passwordHash: "x",
          role: "staff",
          tenantId: "tenant-b",
        },
      ],
      customers: [],
      sites: [],
      machines: [
        {
          id: "m1",
          name: "Host line",
          storedFileName: "a.glb",
          originalFileName: "a.glb",
          parts: [],
          unmatched: [],
          createdAt: "2020-01-01T00:00:00.000Z",
        },
      ],
      quotes: [],
      bugReports: [],
    });
    assert.equal(changed, true);
    assert.equal(db.machines?.[0]?.tenantId, DEFAULT_TENANT_ID);
    assert.equal(db.users?.[0]?.tenantId, "tenant-b");
  });

  it("is a no-op when already migrated", () => {
    const input = {
      schemaVersion: 3,
      tenants: [
        {
          id: DEFAULT_TENANT_ID,
          name: DEFAULT_TENANT_NAME,
          slug: "oee360-host",
          createdAt: "2020-01-01T00:00:00.000Z",
        },
      ],
      users: [
        {
          id: "u1",
          email: "a@test",
          passwordHash: "x",
          role: "staff",
          tenantId: DEFAULT_TENANT_ID,
        },
      ],
      customers: [],
      sites: [],
      machines: [],
      quotes: [],
      bugReports: [],
    };
    const { changed } = migrateTenants(input);
    assert.equal(changed, false);
  });
});
