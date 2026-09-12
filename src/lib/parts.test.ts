import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { joinParts, parsePartsList } from "./parts.ts";

describe("parsePartsList", () => {
  it("parses CSV with optional meshName and qty, defaulting qty to 1", () => {
    const rows = parsePartsList(
      "partNumber,name,meshName,qty\nPN-100,Hydraulic Pump,,\nPN-200,Cover,CoverMesh,4\n",
      "parts.csv",
    );
    assert.deepEqual(rows, [
      { partNumber: "PN-100", name: "Hydraulic Pump", meshName: undefined, qty: 1 },
      { partNumber: "PN-200", name: "Cover", meshName: "CoverMesh", qty: 4 },
    ]);
  });

  it("parses a JSON array and defaults missing qty", () => {
    const rows = parsePartsList(
      JSON.stringify([
        { partNumber: "A-1", name: "Arm", meshName: "ArmMesh" },
        { partNumber: "A-2", name: "Bolt", qty: 12 },
      ]),
      "parts.json",
    );
    assert.deepEqual(rows, [
      { partNumber: "A-1", name: "Arm", meshName: "ArmMesh", qty: 1 },
      { partNumber: "A-2", name: "Bolt", meshName: undefined, qty: 12 },
    ]);
  });

  it("accepts shop-export headers, TSV, and a JSON { parts } wrapper", () => {
    const csv = parsePartsList(
      "Part Number,Description,Quantity,Mesh Name\nPN-9,Guard,2,GuardMesh\n",
      "bom.csv",
    );
    assert.deepEqual(csv, [
      { partNumber: "PN-9", name: "Guard", meshName: "GuardMesh", qty: 2 },
    ]);

    const tsv = parsePartsList(
      "Item Number\tName\tQty\nA-4\tArm\t3\n",
      "bom.tsv",
    );
    assert.deepEqual(tsv, [
      { partNumber: "A-4", name: "Arm", meshName: undefined, qty: 3 },
    ]);

    const wrapped = parsePartsList(
      JSON.stringify({ parts: [{ pn: "B-1", description: "Bracket", quantity: 8 }] }),
      "bom.json",
    );
    assert.equal(wrapped[0]?.partNumber, "B-1");
    assert.equal(wrapped[0]?.name, "Bracket");
    assert.equal(wrapped[0]?.qty, 8);
  });
});

describe("joinParts", () => {
  it("joins on meshName, partNumber, or name and reports unmatched with qty", () => {
    const { parts, unmatched } = joinParts(
      [
        { partNumber: "PN-100", name: "Pump", qty: 1 },
        { partNumber: "PN-200", name: "Cover", meshName: "CoverMesh", qty: 2 },
        { partNumber: "PN-300", name: "Missing", qty: 3 },
      ],
      ["PN-100", "CoverMesh", "Orphan"],
    );

    assert.deepEqual(parts, [
      { id: "PN-100", name: "Pump", meshName: "PN-100", qty: 1 },
      { id: "PN-200", name: "Cover", meshName: "CoverMesh", qty: 2 },
    ]);
    assert.deepEqual(unmatched, [
      { source: "list", id: "PN-300", name: "Missing", qty: 3 },
      { source: "model", meshName: "Orphan" },
    ]);
  });

  it("joins SolidWorks instance names to one BOM row", () => {
    const { parts, unmatched } = joinParts(
      [{ partNumber: "PN-100", name: "Pump", qty: 2 }],
      ["PN-100-1", "PN-100-2", "Cover"],
    );
    assert.equal(parts[0]?.meshName, "PN-100-1");
    assert.deepEqual(
      unmatched.map((row) => row.meshName),
      ["Cover"],
    );
  });

  it("keeps distinct part numbers that look like instance suffixes", () => {
    const rows = ["01", "02", "03"].map((suffix) => ({
      partNumber: `PN-FRAME-RAIL-${suffix}`,
      name: `Frame rail ${suffix}`,
      meshName: `PN-FRAME-RAIL-${suffix}`,
      qty: 1,
    }));
    const { parts, unmatched } = joinParts(
      rows,
      rows.map((row) => row.meshName),
    );
    assert.deepEqual(
      parts.map((part) => part.id),
      ["PN-FRAME-RAIL-01", "PN-FRAME-RAIL-02", "PN-FRAME-RAIL-03"],
    );
    assert.deepEqual(
      parts.map((part) => part.meshName),
      ["PN-FRAME-RAIL-01", "PN-FRAME-RAIL-02", "PN-FRAME-RAIL-03"],
    );
    assert.equal(unmatched.length, 0);
  });

  it("does not let fuzzy matching steal exact-named siblings", () => {
    const { parts } = joinParts(
      [
        { partNumber: "PN-FRAME-RAIL-01", name: "Rail 1", qty: 1 },
        { partNumber: "PN-FRAME-RAIL-02", name: "Rail 2", qty: 1 },
        { partNumber: "PN-FRAME-RAIL-03", name: "Rail 3", qty: 1 },
      ],
      ["PN-FRAME-RAIL-01", "PN-FRAME-RAIL-02", "PN-FRAME-RAIL-03"],
    );
    assert.equal(parts.length, 3);
  });

  it("consumes SolidWorks instance meshes for one aggregated BOM row", () => {
    const { parts, unmatched } = joinParts(
      [
        {
          partNumber: "PN-100",
          name: "Pump",
          meshName: "PN-100-1",
          qty: 2,
        },
      ],
      ["PN-100-1", "PN-100-2", "Body1"],
    );
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.id, "PN-100");
    assert.equal(parts[0]?.meshName, "PN-100-1");
    assert.equal(parts[0]?.qty, 2);
    assert.deepEqual(unmatched, [{ source: "model", meshName: "Body1" }]);
  });

  it("merges instance list rows that share a part number", () => {
    const { parts, unmatched } = joinParts(
      [
        { partNumber: "PN-100", name: "Pump", meshName: "PN-100-1", qty: 1 },
        { partNumber: "PN-100", name: "Pump", meshName: "PN-100-2", qty: 1 },
      ],
      ["PN-100-1", "PN-100-2"],
    );
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.qty, 2);
    assert.equal(unmatched.length, 0);
  });

  it("does not promote unmatched GLB meshes into parts", () => {
    const { parts, unmatched } = joinParts(
      [{ partNumber: "PN-100", name: "Pump", qty: 1 }],
      ["Osaka", "Lantern-1", "Bike"],
    );
    assert.equal(parts.length, 0);
    assert.deepEqual(
      unmatched.filter((row) => row.source === "model").map((row) => row.meshName),
      ["Osaka", "Lantern-1", "Bike"],
    );
    assert.equal(unmatched.some((row) => row.source === "list" && row.id === "PN-100"), true);
  });
});
