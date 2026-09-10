import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { extractMeshNames } from "./gltf.ts";
import { joinParts, parsePartsList } from "./parts.ts";
import { joinPackFiles } from "./pack-upload.ts";

describe("SolidWorks 3-DOF arm pack", () => {
  it("joins the published GLB to the macro-shaped parts list", () => {
    const glb = readFileSync("public/placeholders/arm/3-dof-arm.glb");
    const list = readFileSync(
      "public/placeholders/arm/3-dof-arm-parts.json",
      "utf8",
    );
    const meshNames = extractMeshNames(glb, "3-dof-arm.glb");
    const rows = parsePartsList(list, "3-dof-arm-parts.json");
    const { parts, unmatched } = joinParts(rows, meshNames);

    assert.ok(meshNames.includes("3_DOF_ARM_BASE"));
    assert.ok(meshNames.includes("3_DOF_ARM_SEGMENT-1"));
    assert.ok(meshNames.includes("3_DOF_ARM_SEGMENT-2"));
    assert.deepEqual(
      parts.map((part) => part.id).sort(),
      [
        "3_DOF_ARM_BASE",
        "3_DOF_ARM_END_EFFECTOR",
        "3_DOF_ARM_SEGMENT",
      ],
    );
    assert.equal(parts.find((part) => part.id === "3_DOF_ARM_SEGMENT")?.qty, 2);
    assert.equal(
      unmatched.filter((row) => row.source === "list").length,
      0,
    );

    const uploaded = joinPackFiles({
      modelBytes: glb,
      modelFileName: "3-dof-arm.glb",
      partsText: list,
      partsListName: "3-dof-arm-parts.json",
    });
    assert.ok(!("error" in uploaded));
    if ("error" in uploaded) {
      return;
    }
    assert.equal(uploaded.parts.length, 3);
  });
});
