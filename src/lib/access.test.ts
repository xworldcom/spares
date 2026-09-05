import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessMachine, siteLabel, toPublicUser } from "./access.ts";

describe("plant access", () => {
  it("lets staff see every machine and customers only their plant", () => {
    const staff = { role: "staff" as const, siteIds: [] };
    const ftw = { role: "customer" as const, siteIds: ["site-cargill-ftw"] };
    const machine = { siteId: "site-cargill-ftw" };

    assert.equal(canAccessMachine(staff, machine), true);
    assert.equal(canAccessMachine(ftw, machine), true);
    assert.equal(canAccessMachine(ftw, { siteId: "site-acme-dayton" }), false);
    assert.equal(canAccessMachine(ftw, {}), false);
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
      [
        { id: "site-cargill-ftw", company: "Cargill", name: "Fort Worth" },
        { id: "site-acme-dayton", company: "Acme", name: "Dayton" },
      ],
    );
    assert.deepEqual(user.siteIds, ["site-cargill-ftw"]);
    assert.equal(user.sites?.[0]?.name, "Fort Worth");
  });
});
