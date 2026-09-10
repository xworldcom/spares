import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import {
  createMemoryPersistence,
  setPersistenceForTests,
} from "./persistence.ts";
import { joinPackFiles, readPackForm } from "./pack-upload.ts";
import { resetStoreMemoryForTests, saveMachineFile } from "./store.ts";

const GLB = readFileSync("public/placeholders/hardware/mcmaster-hardware.glb");
const PARTS = readFileSync(
  "public/placeholders/hardware/mcmaster-hardware-parts.json",
  "utf8",
);

describe("joinPackFiles", () => {
  it("joins a hardware pack the same way the upload routes do", () => {
    const joined = joinPackFiles({
      modelBytes: GLB,
      modelFileName: "mcmaster-hardware.glb",
      partsText: PARTS,
      partsListName: "mcmaster-hardware-parts.json",
    });
    assert.ok(!("error" in joined));
    if ("error" in joined) {
      return;
    }
    assert.equal(joined.parts.length, 5);
    assert.ok(joined.unmatched.some((row) => row.id === "93475A240"));
  });

  it("returns a 400 when the parts list is not JSON or CSV", () => {
    const joined = joinPackFiles({
      modelBytes: GLB,
      modelFileName: "mcmaster-hardware.glb",
      partsText: "not-a-parts-list",
      partsListName: "parts.txt",
    });
    assert.equal("error" in joined, true);
    if ("error" in joined) {
      assert.equal(joined.status, 400);
    }
  });

  it("joins a SolidWorks-style pack: parent component nodes + instance meshName", () => {
    const gltf = Buffer.from(
      JSON.stringify({
        nodes: [
          { name: "Scene", children: [1, 3, 5] },
          { name: "PN-100-1", children: [2] },
          { name: "Body1", mesh: 0 },
          { name: "PN-100-2", children: [4] },
          { name: "Body1", mesh: 1 },
          { name: "PN-200-1", children: [6] },
          { name: "Body1", mesh: 2 },
        ],
        meshes: [{ name: "Body1" }, { name: "Body1" }, { name: "Cover" }],
      }),
      "utf8",
    );
    const partsText = JSON.stringify([
      {
        partNumber: "PN-100",
        name: "Pump",
        meshName: "PN-100-1",
        qty: 2,
      },
      {
        partNumber: "PN-200",
        name: "Cover",
        meshName: "PN-200-1",
        qty: 1,
      },
    ]);
    const joined = joinPackFiles({
      modelBytes: gltf,
      modelFileName: "cell.gltf",
      partsText,
      partsListName: "cell-spares-parts.json",
    });
    assert.ok(!("error" in joined));
    if ("error" in joined) {
      return;
    }
    assert.deepEqual(
      joined.parts.map((part) => ({ id: part.id, qty: part.qty, meshName: part.meshName })),
      [
        { id: "PN-100", qty: 2, meshName: "PN-100-1" },
        { id: "PN-200", qty: 1, meshName: "PN-200-1" },
      ],
    );
    assert.equal(
      joined.unmatched.some((row) => row.source === "list"),
      false,
    );
    assert.ok(
      joined.unmatched.every(
        (row) => row.source === "model" && (row.meshName === "Body1" || row.meshName === "Cover"),
      ),
    );
  });

  it("does not invent parts from a bare GLB with no matching list rows", () => {
    const gltf = Buffer.from(
      JSON.stringify({
        nodes: [
          { name: "Osaka", mesh: 0 },
          { name: "Lantern", mesh: 1 },
        ],
        meshes: [{ name: "Osaka" }, { name: "Lantern" }],
      }),
      "utf8",
    );
    const joined = joinPackFiles({
      modelBytes: gltf,
      modelFileName: "tokyo.gltf",
      partsText: JSON.stringify([
        { partNumber: "PN-100", name: "Pump", meshName: "PN-100-1", qty: 1 },
      ]),
      partsListName: "unrelated-parts.json",
    });
    assert.ok(!("error" in joined));
    if ("error" in joined) {
      return;
    }
    assert.equal(joined.parts.length, 0);
    assert.ok(joined.unmatched.some((row) => row.source === "model" && row.meshName === "Osaka"));
    assert.ok(joined.unmatched.some((row) => row.source === "list" && row.id === "PN-100"));
  });
});

describe("readPackForm stored Blob path", () => {
  after(() => {
    setPersistenceForTests(null);
    resetStoreMemoryForTests();
  });

  it("reads an already-stored GLB instead of requiring the model file", async () => {
    const memory = createMemoryPersistence();
    setPersistenceForTests(memory);
    resetStoreMemoryForTests();
    await saveMachineFile("already-there.glb", GLB);

    const form = new FormData();
    form.set("name", "Palletizer cell stress");
    form.set("storedFileName", "already-there.glb");
    form.set("originalFileName", "cell.glb");
    form.set(
      "partsList",
      new File([PARTS], "parts.json", { type: "application/json" }),
    );

    const pack = await readPackForm(form);
    assert.ok(!("status" in pack));
    if ("status" in pack) {
      return;
    }
    assert.equal(pack.alreadyStored, true);
    assert.equal(pack.storedFileName, "already-there.glb");
    assert.equal(pack.originalFileName, "cell.glb");
    assert.equal(pack.modelBytes.length, GLB.length);
  });

  it("rejects a stored path that is not in the files prefix", async () => {
    const form = new FormData();
    form.set("name", "Bad");
    form.set("storedFileName", "spares/db.json");
    form.set(
      "partsList",
      new File([PARTS], "parts.json", { type: "application/json" }),
    );
    const pack = await readPackForm(form);
    assert.equal("status" in pack, true);
    if ("status" in pack) {
      assert.equal(pack.status, 400);
    }
  });
});
