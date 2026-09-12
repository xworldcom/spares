import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { machineFileUrl } from "./machine-file-url.ts";
import { modelObjectKey } from "./model-url.ts";
import {
  backfillModelToS3,
  modelExistsInS3,
  modelProxyRefusedMessage,
  readModelFile,
  setTestS3Objects,
} from "./model-storage.ts";
import { MODEL_BACKFILL_MAX_BYTES, MODEL_PROXY_MAX_BYTES } from "./pack-limits.ts";
import {
  createMemoryPersistence,
  setPersistenceForTests,
} from "./persistence.ts";

function configureS3Env() {
  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_BUCKET = "spares-models";
  process.env.S3_ACCESS_KEY_ID = "key";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
}

describe("model migration: S3 miss falls back to legacy blob/fs", () => {
  after(() => {
    setPersistenceForTests(null);
    setTestS3Objects(null);
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_PUBLIC_BASE_URL;
  });

  it("reads a small model from legacy storage when S3 has no object", async () => {
    configureS3Env();
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    setTestS3Objects(new Map());

    const legacy = Buffer.from("small-glb-bytes");
    await persistence.writeFileBytes("legacy.glb", legacy);

    const bytes = await readModelFile("legacy.glb");
    assert.deepEqual(bytes, legacy);
    assert.equal(await modelExistsInS3("legacy.glb"), false);
  });

  it("prefers S3 bytes when the object exists", async () => {
    configureS3Env();
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    const s3 = new Map<string, Buffer>();
    setTestS3Objects(s3);

    await persistence.writeFileBytes("both.glb", Buffer.from("legacy"));
    s3.set(modelObjectKey("both.glb"), Buffer.from("from-s3"));

    const bytes = await readModelFile("both.glb");
    assert.deepEqual(bytes, Buffer.from("from-s3"));
    assert.equal(await modelExistsInS3("both.glb"), true);
  });

  it("returns the credentialed proxy URL when S3 misses", async () => {
    configureS3Env();
    setPersistenceForTests(createMemoryPersistence());
    setTestS3Objects(new Map());

    const request = new Request("https://preview.example.test/api/machines/m1");
    const url = await machineFileUrl(request, {
      id: "m1",
      storedFileName: "missing.glb",
    });
    assert.equal(url, "https://preview.example.test/api/machines/m1/file");
  });

  it("returns a presigned URL after backfill copies legacy bytes into S3", async () => {
    configureS3Env();
    delete process.env.S3_PUBLIC_BASE_URL;
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    setTestS3Objects(new Map());

    const legacy = Buffer.from("backfilled-glb");
    await persistence.writeFileBytes("backfill-me.glb", legacy);

    const before = await backfillModelToS3("backfill-me.glb");
    assert.equal(before.status, "copied");
    assert.equal(before.bytes, legacy.length);
    assert.equal(await modelExistsInS3("backfill-me.glb"), true);

    const rerun = await backfillModelToS3("backfill-me.glb");
    assert.equal(rerun.status, "skipped_exists");

    const request = new Request(
      "https://spares-yonder3.vercel.app/api/machines/m2",
      { headers: { Origin: "https://spares-yonder3.vercel.app" } },
    );
    const url = await machineFileUrl(request, {
      id: "m2",
      storedFileName: "backfill-me.glb",
    });
    const parsed = new URL(url);
    assert.match(parsed.hostname, /cloudflarestorage\.com$/);
    assert.ok(parsed.searchParams.has("X-Amz-Signature"));
  });

  it("skips backfill for models larger than 40 MB", async () => {
    configureS3Env();
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    setTestS3Objects(new Map());

    const huge = Buffer.alloc(MODEL_BACKFILL_MAX_BYTES + 1);
    await persistence.writeFileBytes("xl.glb", huge);

    const result = await backfillModelToS3("xl.glb");
    assert.equal(result.status, "skipped_too_large");
    assert.equal(await modelExistsInS3("xl.glb"), false);
    assert.match(result.message ?? "", /re-upload/i);
  });

  it("refuses to proxy models over 5 MB through Vercel origin", () => {
    const bytes = MODEL_PROXY_MAX_BYTES + 1;
    const message = modelProxyRefusedMessage(bytes);
    assert.match(message, /too large/i);
    assert.match(message, /backfill-models/i);
    assert.match(message, /re-upload/i);
  });
});
