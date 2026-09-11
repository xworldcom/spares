import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  createMemoryPersistence,
  safeStoredFileName,
  selectStoreKind,
  setPersistenceForTests,
} from "./persistence.ts";

describe("persistence selection", () => {
  after(() => {
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
  });

  it("prefers SPARES_DATA_DIR over a blob token so tests stay on disk", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    process.env.SPARES_DATA_DIR = "/tmp/spares-test-data";
    setPersistenceForTests(null);
    assert.equal(selectStoreKind(), "fs");
  });

  it("uses vercel blob when the token is set and data dir is not", () => {
    delete process.env.SPARES_DATA_DIR;
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    setPersistenceForTests(null);
    assert.equal(selectStoreKind(), "blob");
  });

  it("uses blob on Vercel even if SPARES_DATA_DIR is also set", () => {
    process.env.VERCEL = "1";
    process.env.SPARES_DATA_DIR = "/tmp/spares-test-data";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    setPersistenceForTests(null);
    assert.equal(selectStoreKind(), "blob");
  });

  it("honors an injected backend", () => {
    setPersistenceForTests(createMemoryPersistence());
    assert.equal(selectStoreKind(), "memory");
  });
});

describe("safeStoredFileName", () => {
  it("accepts fixture and uuid file names", () => {
    assert.equal(safeStoredFileName("hardware-fixture.glb"), "hardware-fixture.glb");
    assert.equal(safeStoredFileName("po-abc-def.pdf"), "po-abc-def.pdf");
  });

  it("rejects path traversal", () => {
    assert.throws(() => safeStoredFileName("../db.json"));
    assert.throws(() => safeStoredFileName("a/b.glb"));
    assert.throws(() => safeStoredFileName(""));
  });
});

describe("memory persistence", () => {
  it("round-trips json and bytes", async () => {
    const store = createMemoryPersistence();
    await store.writeDatabaseJson('{"ok":true}');
    await store.writeCareJson('{"tickets":[]}');
    await store.writeFileBytes("part.glb", Buffer.from("glb"));
    assert.equal(await store.readDatabaseJson(), '{"ok":true}');
    assert.equal(await store.readCareJson(), '{"tickets":[]}');
    assert.equal((await store.readFileBytes("part.glb"))?.toString(), "glb");
    assert.equal(await store.readFileBytes("missing.bin"), null);
    await store.deleteFileBytes("part.glb");
    assert.equal(await store.readFileBytes("part.glb"), null);
  });
});
