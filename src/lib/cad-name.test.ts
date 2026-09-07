import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cadKeys, stripCadInstance } from "./cad-name.ts";

describe("cad names", () => {
  it("drops SolidWorks instance suffixes but keeps the part number", () => {
    assert.equal(stripCadInstance("PN-FRAME-1000-1"), "PN-FRAME-1000");
    assert.equal(stripCadInstance("Housing<2>"), "Housing");
    assert.equal(stripCadInstance("91280A340-12"), "91280A340");
    assert.equal(stripCadInstance("PN-FRAME-1000"), "PN-FRAME-1000");
  });

  it("matches a raw instance name to the catalog number", () => {
    assert.ok(cadKeys("PN-FRAME-1000-1").includes("pn-frame-1000"));
    assert.ok(cadKeys("Gearmotor^Default<1>").includes("gearmotor"));
  });
});
