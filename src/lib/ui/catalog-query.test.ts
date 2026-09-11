import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogQueryMatch } from "./catalog-query.ts";

describe("catalogQueryMatch", () => {
  it("matches any field, case-insensitive, and empty query passes", () => {
    assert.equal(catalogQueryMatch("", ["Palletizer"]), true);
    assert.equal(catalogQueryMatch("  fort  ", ["Palletizer", "Cargill · Fort Worth"]), true);
    assert.equal(catalogQueryMatch("wichita", ["Cargill · Fort Worth"]), false);
    assert.equal(catalogQueryMatch("buyer", [undefined, "buyer@acme.test"]), true);
  });
});
