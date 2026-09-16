import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { migrateOrgTree } from "./org-migration.ts";

describe("org migration", () => {
  it("creates customer accounts from legacy site.company values", () => {
    const { db, changed } = migrateOrgTree({
      users: [],
      sites: [
        { id: "site-cargill-ftw", company: "Cargill", name: "Fort Worth" },
        { id: "site-cargill-wichita", company: "Cargill", name: "Wichita" },
        { id: "site-acme-dayton", company: "Acme", name: "Dayton" },
      ],
    });

    assert.equal(changed, true);
    assert.equal(db.schemaVersion, 2);
    assert.equal(db.customers?.length, 2);
    const cargill = db.customers?.find((row) => row.name === "Cargill");
    assert.ok(cargill);
    assert.equal(
      db.sites?.every(
        (site) =>
          site.customerId &&
          (site.company !== "Cargill" || site.customerId === cargill?.id),
      ),
      true,
    );
  });

  it("expands companyAccess into explicit siteIds", () => {
    const { db } = migrateOrgTree({
      users: [
        {
          siteIds: [],
          companyAccess: ["Cargill"],
        },
      ],
      sites: [
        { id: "site-cargill-ftw", company: "Cargill", name: "Fort Worth" },
        { id: "site-cargill-wichita", company: "Cargill", name: "Wichita" },
        { id: "site-acme-dayton", company: "Acme", name: "Dayton" },
      ],
    });

    assert.deepEqual(db.users?.[0]?.siteIds?.sort(), [
      "site-cargill-ftw",
      "site-cargill-wichita",
    ]);
    assert.equal(db.users?.[0]?.companyAccess, undefined);
  });

  it("does not lower a tenant schemaVersion already past the org version", () => {
    const { db } = migrateOrgTree({
      schemaVersion: 3,
      customers: [{ id: "customer-acme", name: "Acme", createdAt: "2020-01-01T00:00:00.000Z" }],
      sites: [
        {
          id: "site-acme-dayton",
          customerId: "customer-acme",
          name: "Dayton",
          createdAt: "2020-01-01T00:00:00.000Z",
        },
      ],
      users: [],
    });
    assert.equal(db.schemaVersion, 3);
  });

  it("is idempotent once schemaVersion is current", () => {
    const first = migrateOrgTree({
      sites: [{ id: "site-a", company: "Acme", name: "Dayton" }],
      users: [],
    }).db;
    const second = migrateOrgTree(first);
    assert.equal(second.changed, false);
    assert.equal(second.db.customers?.length, first.customers?.length);
  });
});
