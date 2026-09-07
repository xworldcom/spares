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
    assert.ok(pack.modelBytes.length > 0);
    assert.ok(pack.modelBytes.length <= GLB.length);
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
