import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { modelObjectKey, modelPublicUrl } from "./model-url.ts";
import { machineFileUrl } from "./machines.ts";
import {
  inlineDbStoreKind,
  selectModelStoreKind,
} from "./model-storage.ts";
import {
  createMemoryPersistence,
  selectStoreKind,
  setPersistenceForTests,
} from "./persistence.ts";

describe("model storage selection", () => {
  after(() => {
    setPersistenceForTests(null);
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_REGION;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_PUBLIC_BASE_URL;
    delete process.env.SPARES_DATA_DIR;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
  });

  it("uses inline model storage when S3 is not configured", () => {
    delete process.env.S3_ENDPOINT;
    setPersistenceForTests(createMemoryPersistence());
    assert.equal(selectModelStoreKind(), "inline");
    assert.equal(inlineDbStoreKind(), "memory");
  });

  it("uses s3 for models while JSON stays on blob", () => {
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-models";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    setPersistenceForTests(null);
    assert.equal(selectStoreKind(), "blob");
    assert.equal(selectModelStoreKind(), "s3");
    assert.equal(inlineDbStoreKind(), "blob");
  });

  it("uses s3 for models while JSON stays on local fs", () => {
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-models";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.SPARES_DATA_DIR = "/tmp/spares-test-data";
    setPersistenceForTests(null);
    assert.equal(selectStoreKind(), "fs");
    assert.equal(selectModelStoreKind(), "s3");
    assert.equal(inlineDbStoreKind(), "fs");
  });
});

describe("model public URLs", () => {
  after(() => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_PUBLIC_BASE_URL;
  });

  it("builds CDN URLs from the public base and object key", () => {
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-models";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_PUBLIC_BASE_URL = "https://cdn.example.test/spares";
    const storedFileName = "hardware-fixture.glb";
    assert.equal(modelObjectKey(storedFileName), "models/hardware-fixture.glb");
    assert.equal(
      modelPublicUrl(storedFileName),
      "https://cdn.example.test/spares/models/hardware-fixture.glb",
    );
  });

  it("prefers the public CDN URL in machine file responses", () => {
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-models";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_PUBLIC_BASE_URL = "https://cdn.example.test/spares";
    const request = new Request("https://preview.example.test/api/machines/m1");
    const url = machineFileUrl(request, {
      id: "m1",
      storedFileName: "abc.glb",
    });
    assert.equal(url, "https://cdn.example.test/spares/models/abc.glb");
  });

  it("falls back to the credentialed API proxy without a public base URL", () => {
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-models";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    delete process.env.S3_PUBLIC_BASE_URL;
    const request = new Request("https://preview.example.test/api/machines/m1");
    const url = machineFileUrl(request, {
      id: "m1",
      storedFileName: "abc.glb",
    });
    assert.equal(url, "https://preview.example.test/api/machines/m1/file");
  });
});
