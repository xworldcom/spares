import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Part } from "../types/index.ts";
import {
  applyManualSubPartMutation,
  assemblyKeyForPart,
  HARDWARE_FIXTURE_MOTOR_SUB_PARTS,
  mergeManualSubAssembliesOnPackReplace,
  manualChildAsPart,
  isManualOnlySubPartId,
  manualSubPartParentPartId,
} from "./manual-sub-assembly.ts";

const motor: Part = {
  id: "6331K32",
  name: "Miniature DC motor",
  meshName: "6331K32",
  qty: 1,
};

describe("manual sub-assembly", () => {
  it("derives a stable assembly key from mesh name", () => {
    assert.equal(assemblyKeyForPart(motor), "6331k32");
  });

  it("merges manual groups when parent mesh survives pack replace", () => {
    const kept = mergeManualSubAssembliesOnPackReplace(
      [HARDWARE_FIXTURE_MOTOR_SUB_PARTS],
      [motor],
      ["6331K32"],
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.children.length, 3);
    assert.equal(kept[0]?.parentMeshName, "6331K32");
  });

  it("drops manual groups when assembly mesh is gone", () => {
    const kept = mergeManualSubAssembliesOnPackReplace(
      [HARDWARE_FIXTURE_MOTOR_SUB_PARTS],
      [],
      ["5972K325"],
    );
    assert.deepEqual(kept, []);
  });

  it("adds, reorders, and removes children with version check", () => {
    const add = applyManualSubPartMutation({
      version: 2,
      parts: [motor],
      meshNames: ["6331K32"],
      manualSubAssemblies: [],
      mutation: {
        baseVersion: 2,
        assemblyKey: "6331k32",
        op: "add",
        child: {
          id: "KIT-1",
          name: "Seal kit",
          qty: 2,
          vendor: "VendorCo",
        },
      },
    });
    assert.ok(!("error" in add));
    assert.equal(add.manualSubAssemblies[0]?.children.length, 1);

    const conflict = applyManualSubPartMutation({
      version: 3,
      parts: [motor],
      meshNames: ["6331K32"],
      manualSubAssemblies: add.manualSubAssemblies,
      mutation: {
        baseVersion: 2,
        assemblyKey: "6331k32",
        op: "remove",
        childId: "KIT-1",
      },
    });
    assert.equal(
      conflict.error,
      "Someone else saved this machine. Refresh and try again.",
    );

    const reorder = applyManualSubPartMutation({
      version: 2,
      parts: [motor],
      meshNames: ["6331K32"],
      manualSubAssemblies: [
        {
          assemblyKey: "6331k32",
          children: [
            { id: "A", name: "A", qty: 1 },
            { id: "B", name: "B", qty: 1 },
          ],
        },
      ],
      mutation: {
        baseVersion: 2,
        assemblyKey: "6331k32",
        op: "reorder",
        childIds: ["B", "A"],
      },
    });
    assert.ok(!("error" in reorder));
    assert.deepEqual(
      reorder.manualSubAssemblies[0]?.children.map((row) => row.id),
      ["B", "A"],
    );
  });

  it("detects manual-only sub-part ids", () => {
    const groups = [HARDWARE_FIXTURE_MOTOR_SUB_PARTS];
    assert.equal(
      isManualOnlySubPartId("6331K32-BRUSH", [motor], groups),
      true,
    );
    assert.equal(isManualOnlySubPartId("6331K32", [motor], groups), false);
    assert.equal(isManualOnlySubPartId("UNKNOWN", [motor], groups), false);
    assert.equal(
      manualSubPartParentPartId("6331K32-BRUSH", [motor], groups),
      "6331K32",
    );
  });

  it("maps manual children to quote-ready parts", () => {
    const child = HARDWARE_FIXTURE_MOTOR_SUB_PARTS.children[0];
    const part = manualChildAsPart(child, motor);
    assert.equal(part.id, "6331K32-BRUSH");
    assert.equal(part.meshName, "6331K32");
    assert.equal(part.vendor, "McMaster-Carr");
  });
});
