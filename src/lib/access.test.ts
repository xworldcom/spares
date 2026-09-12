import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accessOptions,
  accessSummary,
  accessSummaryParts,
  canAccessMachine,
  grantFromUser,
  isMachineGranted,
  isSiteFullyGranted,
  normalizeAccessGrant,
  parseAccessValue,
  siteLabel,
  toggleMachineGrant,
  toggleSiteGrant,
  toPublicUser,
} from "./access.ts";

const accounts = [
  { id: "customer-cargill", name: "Cargill", createdAt: "2020-01-01T00:00:00.000Z" },
  { id: "customer-acme", name: "Acme", createdAt: "2020-01-01T00:00:00.000Z" },
];

const sites = [
  {
    id: "site-cargill-ftw",
    customerId: "customer-cargill",
    name: "Fort Worth",
    createdAt: "2020-01-01T00:00:00.000Z",
  },
  {
    id: "site-cargill-wichita",
    customerId: "customer-cargill",
    name: "Wichita",
    createdAt: "2020-01-01T00:00:00.000Z",
  },
  {
    id: "site-acme-dayton",
    customerId: "customer-acme",
    name: "Dayton",
    createdAt: "2020-01-01T00:00:00.000Z",
  },
];

const machines = [
  { id: "palletizer", name: "Palletizer", siteId: "site-cargill-ftw" },
  { id: "hardware-fixture", name: "Hardware Fixture", siteId: "site-acme-dayton" },
  { id: "line-a", name: "Line A", siteId: "site-cargill-ftw" },
];

describe("site access", () => {
  it("lets staff see every machine and customers only their sites", () => {
    const staff = { role: "staff" as const, siteIds: [] };
    const ftw = { role: "customer" as const, siteIds: ["site-cargill-ftw"] };
    const machine = { siteId: "site-cargill-ftw" };

    assert.equal(canAccessMachine(staff, machine, sites, accounts), true);
    assert.equal(canAccessMachine(ftw, machine, sites, accounts), true);
    assert.equal(
      canAccessMachine(ftw, { siteId: "site-acme-dayton" }, sites, accounts),
      false,
    );
    assert.equal(canAccessMachine(ftw, {}, sites, accounts), false);
  });

  it("lets a person through on a single machine grant", () => {
    const guest = {
      role: "customer" as const,
      siteIds: [],
      machineIds: ["palletizer"],
    };
    assert.equal(
      canAccessMachine(
        guest,
        { id: "palletizer", siteId: "site-acme-dayton" },
        sites,
        accounts,
      ),
      true,
    );
    assert.equal(
      canAccessMachine(guest, { id: "other", siteId: "site-acme-dayton" }, sites, accounts),
      false,
    );
  });

  it("supports multi-site access", () => {
    const corp = {
      role: "customer" as const,
      siteIds: ["site-cargill-ftw", "site-cargill-wichita"],
    };
    assert.equal(
      canAccessMachine(corp, { siteId: "site-cargill-ftw" }, sites, accounts),
      true,
    );
    assert.equal(
      canAccessMachine(corp, { siteId: "site-cargill-wichita" }, sites, accounts),
      true,
    );
    assert.equal(
      canAccessMachine(corp, { siteId: "site-acme-dayton" }, sites, accounts),
      false,
    );
  });

  it("parses a single site id", () => {
    assert.deepEqual(parseAccessValue("site:site-cargill-ftw"), {
      siteIds: ["site-cargill-ftw"],
    });
    assert.deepEqual(parseAccessValue(""), {
      siteIds: [],
    });
  });

  it("lists sites grouped by customer", () => {
    const labels = accessOptions(sites, accounts).map((row) => row.label);
    assert.deepEqual(labels, [
      "Acme · Dayton",
      "Cargill · Fort Worth",
      "Cargill · Wichita",
    ]);
  });

  it("labels a site as customer · site", () => {
    assert.equal(
      siteLabel(sites[0], accounts),
      "Cargill · Fort Worth",
    );
  });

  it("summarizes multiple site assignments", () => {
    const user = toPublicUser(
      {
        id: "u1",
        email: "buyer@cargill.test",
        role: "customer",
        siteIds: ["site-cargill-ftw", "site-cargill-wichita"],
      },
      sites,
      accounts,
    );
    assert.equal(
      accessSummary(user, accounts, sites, machines),
      "Cargill · Fort Worth, Cargill · Wichita",
    );
    assert.equal(user.sites?.[0]?.name, "Fort Worth");
  });
});

describe("access grants", () => {
  it("promotes a full machine selection to a site grant", () => {
    let grant = grantFromUser({});
    grant = toggleSiteGrant(grant, "site-cargill-ftw", machines);
    assert.deepEqual(normalizeAccessGrant(grant, machines), {
      siteIds: ["site-cargill-ftw"],
      machineIds: [],
    });
    assert.equal(isSiteFullyGranted(grant, "site-cargill-ftw", machines), true);
    assert.equal(isMachineGranted(grant, machines[0]), true);
    assert.equal(isMachineGranted(grant, machines[2]), true);
  });

  it("keeps partial machine picks as machineIds", () => {
    let grant = grantFromUser({});
    grant = toggleMachineGrant(grant, machines[0], machines);
    assert.deepEqual(normalizeAccessGrant(grant, machines), {
      siteIds: [],
      machineIds: ["palletizer"],
    });
    assert.equal(
      accessSummaryParts(grant, sites, accounts, machines).join(", "),
      "Cargill · Fort Worth · Palletizer",
    );
  });

  it("converts a whole site grant into partial machines when one machine is cleared", () => {
    let grant = toggleSiteGrant(grantFromUser({}), "site-cargill-ftw", machines);
    grant = toggleMachineGrant(grant, machines[0], machines);
    assert.deepEqual(normalizeAccessGrant(grant, machines), {
      siteIds: [],
      machineIds: ["line-a"],
    });
  });

  it("preserves legacy siteIds as whole-site access", () => {
    const grant = grantFromUser({ siteIds: ["site-cargill-ftw"] });
    assert.equal(isSiteFullyGranted(grant, "site-cargill-ftw", machines), true);
    assert.deepEqual(normalizeAccessGrant(grant, machines), grant);
  });
});
