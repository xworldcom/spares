import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import { readStoredModelAfterUpload } from "./read-stored-model.ts";
import { resetStoreMemoryForTests, saveMachineFile } from "./store.ts";

describe("readStoredModelAfterUpload", () => {
  it("reads inline storage without sleeping", async () => {
    const memory = createMemoryPersistence();
    setPersistenceForTests(memory);
    resetStoreMemoryForTests();
    const bytes = Buffer.from("glb");
    await saveMachineFile("inline.glb", bytes);
    const read = await readStoredModelAfterUpload("inline.glb");
    assert.deepEqual(read, bytes);
    setPersistenceForTests(null);
    resetStoreMemoryForTests();
  });
});
