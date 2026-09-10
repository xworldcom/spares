import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyStaffPartEdit,
  extraModelMeshes,
  knownMeshNames,
  parseStaffPartEdit,
  staffCatalogRows,
  staffJoinCounts,
} from "./staff-catalog.ts";
import type { Part, UnmatchedPart } from "@/types";

const joined: Part[] = [
  { id: "PN-FRAME-1000", name: "Frame weldment", meshName: "PN-FRAME-1000", qty: 1 },
  { id: "PN-ROLL-2104", name: "Drive roller", meshName: "PN-ROLL-2104", qty: 2 },
];

const unmatched: UnmatchedPart[] = [
  { source: "list", id: "PN-BELT-4402", name: "Conveyor belt", qty: 1 },
  { source: "model", meshName: "PN-GRD-5503" },
];

const meshNames = [
  "PN-FRAME-1000",
  "PN-ROLL-2104",
  "PN-GRD-5503",
];

describe("staffCatalogRows", () => {
  it("lists joined parts and missing-mesh BOM rows, not extra model meshes", () => {
    const rows = staffCatalogRows(joined, unmatched);
    assert.deepEqual(
      rows.map((row) => [row.key, row.status, row.partNumber]),
      [
        ["part:PN-FRAME-1000", "joined", "PN-FRAME-1000"],
        ["part:PN-ROLL-2104", "joined", "PN-ROLL-2104"],
        ["list:PN-BELT-4402", "missing-mesh", "PN-BELT-4402"],
      ],
    );
    assert.deepEqual(extraModelMeshes(unmatched), ["PN-GRD-5503"]);
    assert.deepEqual(staffJoinCounts(joined, unmatched), {
      joined: 2,
      missing: 1,
      extra: 1,
    });
  });
});

describe("applyStaffPartEdit", () => {
  it("keeps an already-joined part pickable when name and qty change", () => {
    const next = applyStaffPartEdit({
      parts: joined,
      unmatched,
      meshNames,
      edit: {
        id: "PN-ROLL-2104",
        partNumber: "PN-ROLL-2104",
        name: "Drive roller, spare",
        meshName: "PN-ROLL-2104",
        qty: 3,
      },
    });
    assert.ok(!("error" in next));
    if ("error" in next) {
      return;
    }
    const roller = next.parts.find((part) => part.id === "PN-ROLL-2104");
    assert.equal(roller?.name, "Drive roller, spare");
    assert.equal(roller?.qty, 3);
    assert.equal(roller?.meshName, "PN-ROLL-2104");
    assert.equal(next.parts.length, 2);
    assert.ok(next.unmatched.some((row) => row.source === "list" && row.id === "PN-BELT-4402"));
    assert.ok(next.unmatched.some((row) => row.source === "model" && row.meshName === "PN-GRD-5503"));
  });

  it("joins a missing-mesh BOM row when staff assigns an extra model mesh", () => {
    const next = applyStaffPartEdit({
      parts: joined,
      unmatched,
      meshNames,
      edit: {
        key: "list:PN-BELT-4402",
        partNumber: "PN-BELT-4402",
        name: "Conveyor belt",
        meshName: "PN-GRD-5503",
        qty: 1,
      },
    });
    assert.ok(!("error" in next));
    if ("error" in next) {
      return;
    }
    const belt = next.parts.find((part) => part.id === "PN-BELT-4402");
    assert.equal(belt?.meshName, "PN-GRD-5503");
    assert.equal(belt?.name, "Conveyor belt");
    assert.equal(next.parts.length, 3);
    assert.equal(
      next.unmatched.some((row) => row.source === "list"),
      false,
    );
    assert.equal(
      next.unmatched.some((row) => row.source === "model"),
      false,
    );
  });

  it("does not invent a part from an extra mesh with no BOM row", () => {
    const next = applyStaffPartEdit({
      parts: joined,
      unmatched,
      meshNames,
      edit: {
        id: "PN-ROLL-2104",
        partNumber: "PN-ROLL-2104",
        name: "Drive roller",
        meshName: "PN-ROLL-2104",
        qty: 2,
      },
    });
    assert.ok(!("error" in next));
    if ("error" in next) {
      return;
    }
    assert.equal(
      next.parts.some((part) => part.meshName === "PN-GRD-5503"),
      false,
    );
    assert.ok(next.unmatched.some((row) => row.meshName === "PN-GRD-5503"));
  });

  it("moves a mesh from one part to another and leaves the donor missing", () => {
    const next = applyStaffPartEdit({
      parts: joined,
      unmatched,
      meshNames,
      edit: {
        id: "PN-BELT-4402",
        partNumber: "PN-BELT-4402",
        name: "Conveyor belt",
        meshName: "PN-FRAME-1000",
        qty: 1,
      },
    });
    assert.ok(!("error" in next));
    if ("error" in next) {
      return;
    }
    const belt = next.parts.find((part) => part.id === "PN-BELT-4402");
    assert.equal(belt?.meshName, "PN-FRAME-1000");
    assert.equal(
      next.parts.some((part) => part.id === "PN-FRAME-1000"),
      false,
    );
    assert.ok(
      next.unmatched.some(
        (row) => row.source === "list" && row.id === "PN-FRAME-1000",
      ),
    );
  });

  it("rejects a duplicate part number", () => {
    const next = applyStaffPartEdit({
      parts: joined,
      unmatched,
      meshNames,
      edit: {
        id: "PN-ROLL-2104",
        partNumber: "PN-FRAME-1000",
        name: "Drive roller",
        meshName: "PN-ROLL-2104",
        qty: 2,
      },
    });
    assert.equal("error" in next, true);
    if ("error" in next) {
      assert.match(next.error, /already on this list/i);
    }
  });

  it("clears a mesh link when the part number does not still match a mesh", () => {
    const next = applyStaffPartEdit({
      parts: [
        { id: "PN-COVER", name: "Cover", meshName: "CoverMesh", qty: 1 },
        { id: "PN-ROLL-2104", name: "Drive roller", meshName: "PN-ROLL-2104", qty: 2 },
      ],
      unmatched: [{ source: "model", meshName: "PN-GRD-5503" }],
      meshNames: ["CoverMesh", "PN-ROLL-2104", "PN-GRD-5503"],
      edit: {
        id: "PN-COVER",
        partNumber: "PN-COVER",
        name: "Cover",
        meshName: "",
        qty: 1,
      },
    });
    assert.ok(!("error" in next));
    if ("error" in next) {
      return;
    }
    assert.equal(
      next.parts.some((part) => part.id === "PN-COVER"),
      false,
    );
    assert.ok(
      next.unmatched.some((row) => row.source === "list" && row.id === "PN-COVER"),
    );
    assert.ok(
      next.unmatched.some(
        (row) => row.source === "model" && row.meshName === "CoverMesh",
      ),
    );
    assert.equal(
      next.parts.some((part) => part.id === "PN-ROLL-2104"),
      true,
    );
  });
});

describe("parseStaffPartEdit", () => {
  it("requires part number, name, qty, and a key", () => {
    const parsed = parseStaffPartEdit({
      id: "PN-100",
      partNumber: "PN-100",
      name: "Pump",
      meshName: "PumpMesh",
      qty: "4",
    });
    assert.ok(!("error" in parsed));
    if ("error" in parsed) {
      return;
    }
    assert.equal(parsed.qty, 4);
    assert.equal(parsed.meshName, "PumpMesh");
    assert.deepEqual(parseStaffPartEdit({ name: "Pump", qty: 1 }), {
      error: "Enter a part number",
    });
  });
});

describe("knownMeshNames", () => {
  it("reconstructs names from joined parts and extra model meshes", () => {
    assert.deepEqual(knownMeshNames(joined, unmatched).sort(), [
      "PN-FRAME-1000",
      "PN-GRD-5503",
      "PN-ROLL-2104",
    ]);
  });
});
