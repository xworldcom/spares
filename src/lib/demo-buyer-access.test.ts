import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { canAccessMachine } from "./access.ts";
import { DEMO_TENANT_BUYER } from "./demo-tenant-data-migration.ts";
import {
  DEMO_BUYER_COMPANY_LABEL,
  isPublicDemoBuyerEmail,
  scrubMachineSiteFieldsForDemoBuyer,
} from "./demo-buyer-access.ts";
import { applyDemoBuyerAccessIsolationMigration } from "./demo-tenant-data-migration.ts";
import { FIXTURE_MACHINE_IDS } from "./seed-fixtures.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";
import { toMachineSummary } from "./machines.ts";

const sites = [
  {
    id: "site-cargill-ftw",
    customerId: "customer-cargill",
    name: "Fort Worth",
    createdAt: "2020-01-01T00:00:00.000Z",
  },
  {
    id: "site-acme-dayton",
    customerId: "customer-acme",
    name: "Dayton",
    createdAt: "2020-01-01T00:00:00.000Z",
  },
];

const accounts = [
  { id: "customer-cargill", name: "Cargill", createdAt: "2020-01-01T00:00:00.000Z" },
  { id: "customer-acme", name: "Acme", createdAt: "2020-01-01T00:00:00.000Z" },
];

const previousSeed = process.env.SPARES_ALLOW_SEED;

before(() => {
  process.env.SPARES_ALLOW_SEED = "false";
});

after(() => {
  if (previousSeed === undefined) {
    delete process.env.SPARES_ALLOW_SEED;
  } else {
    process.env.SPARES_ALLOW_SEED = previousSeed;
  }
});

describe("public demo buyer isolation", () => {
  it("recognizes the shared demo login email", () => {
    assert.equal(isPublicDemoBuyerEmail(DEMO_TENANT_BUYER.email), true);
    assert.equal(isPublicDemoBuyerEmail("other@demo.com"), false);
  });

  it("ignores site grants and only allows demo fixture machines", () => {
    const buyer = {
      role: "customer" as const,
      email: DEMO_TENANT_BUYER.email,
      siteIds: ["site-cargill-ftw"],
      machineIds: [FIXTURE_MACHINE_IDS.hardware],
      tenantId: DEFAULT_TENANT_ID,
    };
    assert.equal(
      canAccessMachine(
        buyer,
        { id: FIXTURE_MACHINE_IDS.hardware, siteId: "site-acme-dayton" },
        sites,
        accounts,
      ),
      true,
    );
    assert.equal(
      canAccessMachine(
        buyer,
        { id: FIXTURE_MACHINE_IDS.palletizer, siteId: "site-cargill-ftw" },
        sites,
        accounts,
      ),
      true,
    );
    assert.equal(
      canAccessMachine(
        buyer,
        { id: "real-customer-machine", siteId: "site-cargill-ftw" },
        sites,
        accounts,
      ),
      false,
    );
  });

  it("scrubs real company names from machine summaries", () => {
    const summary = toMachineSummary(
      {
        id: FIXTURE_MACHINE_IDS.palletizer,
        name: "Palletizer",
        siteId: "site-cargill-ftw",
      },
      sites,
      accounts,
      { email: DEMO_TENANT_BUYER.email },
    );
    assert.equal(summary.company, DEMO_BUYER_COMPANY_LABEL);
    assert.equal(summary.siteName, "Plant 2");
    assert.notEqual(summary.company, "Cargill");
  });

  it("migration strips siteIds and grants both demo machines", () => {
    const result = applyDemoBuyerAccessIsolationMigration({
      users: [
        {
          id: "demo-buyer",
          email: DEMO_TENANT_BUYER.email,
          role: "customer",
          siteIds: ["site-cargill-ftw", "site-cargill-wichita"],
          machineIds: [FIXTURE_MACHINE_IDS.hardware],
        },
      ],
      machines: [],
      dataMigrations: {},
    });
    assert.equal(result.changed, true);
    const buyer = result.db.users[0];
    assert.deepEqual(buyer.siteIds, []);
    assert.deepEqual(buyer.machineIds, [
      FIXTURE_MACHINE_IDS.hardware,
      FIXTURE_MACHINE_IDS.palletizer,
    ]);
  });

  it("scrub helper leaves non-demo machine fields unchanged", () => {
    assert.deepEqual(
      scrubMachineSiteFieldsForDemoBuyer(
        { id: "other-machine", siteId: "site-cargill-ftw" },
        { company: "Cargill", siteName: "Fort Worth" },
      ),
      { company: "Cargill", siteName: "Fort Worth" },
    );
  });
});
