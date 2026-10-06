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

  it("keeps a satellite machine when the catalog is still on schema 2", () => {
    const { db } = migrateTenants({
      schemaVersion: 2,
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
      users: [],
      customers: [],
      sites: [],
      machines: [
        {
          id: "m-sat",
          name: "Sat line",
          storedFileName: "s.glb",
          originalFileName: "s.glb",
          parts: [],
          unmatched: [],
          createdAt: "2020-01-01T00:00:00.000Z",
          tenantId: "tenant-b",
        },
      ],
      quotes: [],
      bugReports: [],
    });
    assert.equal(db.schemaVersion, 3);
    assert.equal(db.machines?.[0]?.tenantId, "tenant-b");
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

  it("does not auto-stamp users to the host tenant when multiple tenants exist", () => {
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
          bootstrapStaffEmail: "companyb-staff@test",
        },
      ],
      users: [
        {
          id: "u-new",
          email: "companyb-staff@test",
          passwordHash: "x",
          role: "staff",
        },
      ],
      customers: [],
      sites: [],
      machines: [],
      quotes: [],
      bugReports: [],
    });
    assert.equal(changed, true);
    assert.equal(db.users?.[0]?.tenantId, "tenant-b");
  });

  it("repairs non-host staff mistakenly stamped to the host tenant", () => {
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
          bootstrapStaffEmail: "companyb-staff@test",
        },
      ],
      users: [
        {
          id: "u-host",
          email: "kevin@huzevka.com",
          passwordHash: "x",
          role: "staff",
          tenantId: DEFAULT_TENANT_ID,
        },
        {
          id: "u-b",
          email: "companyb-staff@test",
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
    });
    assert.equal(changed, true);
    assert.equal(db.users?.[0]?.tenantId, DEFAULT_TENANT_ID);
    assert.equal(db.users?.[1]?.tenantId, "tenant-b");
  });

  it("repairs host-stamped satellite staff when multiple satellite tenants exist", () => {
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
          id: "tenant-b-old",
          name: "Company B old",
          slug: "company-b-old",
          createdAt: "2020-01-02T00:00:00.000Z",
        },
        {
          id: "tenant-b-new",
          name: "Company B",
          slug: "company-b",
          createdAt: "2025-01-01T00:00:00.000Z",
          bootstrapStaffEmail: "companyb-staff@test",
        },
      ],
      users: [
        {
          id: "u-b",
          email: "companyb-staff@test",
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
    });
    assert.equal(changed, true);
    assert.equal(db.users?.[0]?.tenantId, "tenant-b-new");
  });

  it("preserves explicit satellite staff tenantId during initial schema migration", () => {
    const { db } = migrateTenants({
      schemaVersion: 2,
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
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      users: [
        {
          id: "u-b",
          email: "companyb-staff@test",
          passwordHash: "x",
          role: "staff",
          tenantId: "tenant-b",
        },
      ],
      customers: [],
      sites: [],
      machines: [],
      quotes: [],
      bugReports: [],
    });
    assert.equal(db.users?.[0]?.tenantId, "tenant-b");
  });

  it("keeps Soft Launch host-company staff on the host tenant when satellites exist", () => {
    const { db, changed } = migrateTenants({
      schemaVersion: 3,
      tenants: [
        {
          id: DEFAULT_TENANT_ID,
          name: DEFAULT_TENANT_NAME,
          slug: "oee360-host",
          createdAt: "2020-01-01T00:00:00.000Z",
          ticketInboundLocalPart: "oee360-host",
        },
        {
          id: "tenant-sat",
          name: "Satellite Co",
          slug: "satellite-co",
          createdAt: "2025-01-01T00:00:00.000Z",
          bootstrapStaffEmail: "satellite-only@test",
          ticketInboundLocalPart: "satellite-co",
        },
      ],
      users: [
        {
          id: "u-host-staff",
          email: "qa-staff-host4-pr128@example.com",
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
    });
    assert.equal(changed, false);
    assert.equal(db.users?.[0]?.tenantId, DEFAULT_TENANT_ID);
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
          ticketInboundLocalPart: "oee360-host",
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
