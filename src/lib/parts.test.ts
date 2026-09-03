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
});
