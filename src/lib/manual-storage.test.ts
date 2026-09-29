import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  assertManualUploadAllowed,
  inlineManualStoreKind,
  manualObjectKey,
  selectManualStoreKind,
  setTestManualS3Objects,
  vercelRequiresManualObjectStorageMessage,
  writeManualFile,
} from "./manual-storage.ts";
import { modelObjectKey } from "./model-url.ts";
import {
  createMemoryPersistence,
  selectStoreKind,
  setPersistenceForTests,
} from "./persistence.ts";
import { selectModelStoreKind } from "./model-storage.ts";

describe("manual storage selection", () => {
  after(() => {
    setPersistenceForTests(null);
    setTestManualS3Objects(null);
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_REGION;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.SPARES_DATA_DIR;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
  });

  it("uses inline manuals when S3 is not configured", () => {
    delete process.env.S3_ENDPOINT;
    setPersistenceForTests(createMemoryPersistence());
    assert.equal(selectManualStoreKind(), "inline");
    assert.equal(inlineManualStoreKind(), "memory");
  });

  it("uses s3 for manuals while JSON can stay on blob and models stay on models/", () => {
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-models";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    setPersistenceForTests(null);
    assert.equal(selectStoreKind(), "blob");
    assert.equal(selectManualStoreKind(), "s3");
    assert.equal(selectModelStoreKind(), "s3");
    assert.equal(manualObjectKey("guide.pdf"), "manuals/guide.pdf");
    assert.equal(modelObjectKey("cell.glb"), "models/cell.glb");
  });

  it("hard-fails Vercel uploads without R2 and never mentions Blob as a fallback", () => {
    process.env.VERCEL = "1";
    delete process.env.S3_ENDPOINT;
    assert.throws(() => assertManualUploadAllowed(), /object storage/);
    assert.match(vercelRequiresManualObjectStorageMessage(), /not stored on Blob/);
  });

  it("writes manuals into the test R2 map under manuals/", async () => {
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-models";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    const map = new Map<string, Buffer>();
    setTestManualS3Objects(map);
    await writeManualFile("safety.pdf", Buffer.from("%PDF-1.4"));
    assert.equal(map.has("manuals/safety.pdf"), true);
    assert.equal(map.has("models/safety.pdf"), false);
  });
});
