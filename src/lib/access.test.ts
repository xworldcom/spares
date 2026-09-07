import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accessOptions,
  canAccessMachine,
  parseAccessValue,
  siteLabel,
  toPublicUser,
} from "./access.ts";

const sites = [
  { id: "site-cargill-ftw", company: "Cargill", name: "Fort Worth" },
  { id: "site-cargill-wichita", company: "Cargill", name: "Wichita" },
  { id: "site-acme-dayton", company: "Acme", name: "Dayton" },
];

describe("plant access", () => {
  it("lets staff see every machine and customers only their plant", () => {
    const staff = { role: "staff" as const, siteIds: [] };
    const ftw = { role: "customer" as const, siteIds: ["site-cargill-ftw"] };
    const machine = { siteId: "site-cargill-ftw" };

    assert.equal(canAccessMachine(staff, machine, sites), true);
    assert.equal(canAccessMachine(ftw, machine, sites), true);
    assert.equal(
      canAccessMachine(ftw, { siteId: "site-acme-dayton" }, sites),
      false,
    );
    assert.equal(canAccessMachine(ftw, {}, sites), false);
  });

  it("lets a person through on a single machine grant", () => {
    const guest = {
      role: "customer" as const,
      siteIds: [],
      machineIds: ["palletizer"],
    };
    assert.equal(
      canAccessMachine(guest, { id: "palletizer", siteId: "site-acme-dayton" }, sites),
      true,
    );
    assert.equal(
      canAccessMachine(guest, { id: "other", siteId: "site-acme-dayton" }, sites),
      false,
    );
  });

  it("lets corporate see every plant at their company", () => {
    const corp = {
      role: "customer" as const,
      siteIds: [],
      companyAccess: ["Cargill"],
    };
    assert.equal(
      canAccessMachine(corp, { siteId: "site-cargill-ftw" }, sites),
      true,
    );
    assert.equal(
      canAccessMachine(corp, { siteId: "site-cargill-wichita" }, sites),
      true,
    );
    assert.equal(
      canAccessMachine(corp, { siteId: "site-acme-dayton" }, sites),
      false,
    );
  });

  it("parses All plants vs a single plant", () => {
    assert.deepEqual(parseAccessValue("company:Cargill"), {
      siteIds: [],
      companyAccess: ["Cargill"],
    });
    assert.deepEqual(parseAccessValue("site:site-cargill-ftw"), {
      siteIds: ["site-cargill-ftw"],
      companyAccess: [],
    });
    assert.deepEqual(parseAccessValue(""), {
      siteIds: [],
      companyAccess: [],
    });
  });

  it("lists All plants above each company's sites", () => {
    const labels = accessOptions(sites).map((row) => row.label);
    assert.deepEqual(labels.slice(0, 3), [
      "Acme · All plants",
      "Acme · Dayton",
      "Cargill · All plants",
    ]);
  });

  it("labels a plant as company · site", () => {
    assert.equal(
      siteLabel({ company: "Cargill", name: "Fort Worth" }),
      "Cargill · Fort Worth",
    );
  });

  it("attaches resolved plants on a public customer", () => {
    const user = toPublicUser(
      {
        id: "u1",
        email: "buyer@cargill.test",
        role: "customer",
        siteIds: ["site-cargill-ftw"],
      },
      sites,
    );
    assert.deepEqual(user.siteIds, ["site-cargill-ftw"]);
    assert.equal(user.sites?.[0]?.name, "Fort Worth");
  });
});
