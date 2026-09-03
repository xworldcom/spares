import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { extractMeshNames } from "./gltf.ts";
import { joinParts, parsePartsList } from "./parts.ts";

describe("T1.1 placeholder pack", () => {
  it("joins three named parts and leaves the belt and guard unmatched", () => {
    const glb = readFileSync("public/placeholders/palletizer-placeholder.glb");
    const list = readFileSync(
      "public/placeholders/palletizer-parts.json",
      "utf8",
    );
    const meshNames = extractMeshNames(glb, "palletizer-placeholder.glb");
    const rows = parsePartsList(list, "palletizer-parts.json");
    const { parts, unmatched } = joinParts(rows, meshNames);

    assert.deepEqual(
      parts.map((part) => part.id).sort(),
      ["PN-FRAME-1000", "PN-MTR-3301", "PN-ROLL-2104"],
    );
    assert.equal(parts.find((part) => part.id === "PN-ROLL-2104")?.qty, 2);
    assert.ok(
      unmatched.some(
        (row) => row.source === "list" && row.id === "PN-BELT-4402",
      ),
    );
    assert.ok(
      unmatched.some(
        (row) => row.source === "model" && row.meshName === "PN-GRD-5503",
      ),
    );
  });
});
