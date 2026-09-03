import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { joinParts, parsePartsList } from "./parts.ts";

describe("parsePartsList", () => {
  it("parses CSV with optional meshName", () => {
    const rows = parsePartsList(
      "partNumber,name,meshName\nPN-100,Hydraulic Pump,\nPN-200,Cover,CoverMesh\n",
      "parts.csv",
    );
    assert.deepEqual(rows, [
      { partNumber: "PN-100", name: "Hydraulic Pump", meshName: undefined },
      { partNumber: "PN-200", name: "Cover", meshName: "CoverMesh" },
    ]);
  });

  it("parses a JSON array", () => {
    const rows = parsePartsList(
      JSON.stringify([{ partNumber: "A-1", name: "Arm", meshName: "ArmMesh" }]),
      "parts.json",
    );
    assert.deepEqual(rows, [{ partNumber: "A-1", name: "Arm", meshName: "ArmMesh" }]);
  });
});

describe("joinParts", () => {
  it("joins on meshName, partNumber, or name and reports unmatched", () => {
    const { parts, unmatched } = joinParts(
      [
        { partNumber: "PN-100", name: "Pump" },
        { partNumber: "PN-200", name: "Cover", meshName: "CoverMesh" },
        { partNumber: "PN-300", name: "Missing" },
      ],
      ["PN-100", "CoverMesh", "Orphan"],
    );

    assert.deepEqual(parts, [
      { id: "PN-100", name: "Pump", meshName: "PN-100" },
      { id: "PN-200", name: "Cover", meshName: "CoverMesh" },
    ]);
    assert.deepEqual(unmatched, [
      { source: "list", id: "PN-300", name: "Missing" },
      { source: "model", meshName: "Orphan" },
    ]);
  });
});
