import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partMatchesBomFilter } from "./parts-bom-filter.ts";

describe("partMatchesBomFilter", () => {
  const part = {
    id: "PN-1",
    name: "Drive roller",
    meshName: "",
    qty: 1,
  };

  it("matches name needle", () => {
    assert.equal(partMatchesBomFilter(part, "drive", ""), true);
    assert.equal(partMatchesBomFilter(part, "gear", ""), false);
  });
});
