import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { resolveMachineFileServe } from "./model-file-serve.ts";
import { modelObjectKey, setTestS3Objects } from "./model-storage.ts";
import { MODEL_PROXY_MAX_BYTES } from "./pack-limits.ts";
import {
  createMemoryPersistence,
  setPersistenceForTests,
} from "./persistence.ts";
import { readPackForm } from "./pack-upload.ts";
import { resetStoreMemoryForTests } from "./store.ts";

const GLB = readFileSync("public/placeholders/hardware/mcmaster-hardware.glb");
const PARTS = readFileSync(
  "public/placeholders/hardware/mcmaster-hardware-parts.json",
  "utf8",
);

function configureS3Env() {
  process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.S3_BUCKET = "spares-models";
  process.env.S3_ACCESS_KEY_ID = "key";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
}

describe("readPackForm multipart guards", () => {
  after(() => {
    setPersistenceForTests(null);
    resetStoreMemoryForTests();
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.VERCEL;
  });

  it("rejects multipart GLB uploads when S3 is configured", async () => {
    configureS3Env();
    const form = new FormData();
    form.set("name", "Line 1");
    form.set("model", new File([GLB], "cell.glb", { type: "model/gltf-binary" }));
    form.set(
      "partsList",
      new File([PARTS], "parts.json", { type: "application/json" }),
    );

    const pack = await readPackForm(form);
    assert.equal("status" in pack, true);
    if ("status" in pack) {
      assert.equal(pack.status, 400);
      assert.match(pack.error, /object storage/i);
    }
  });

  it("rejects multipart GLB uploads on Vercel without S3", async () => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    process.env.VERCEL = "1";

    const form = new FormData();
    form.set("name", "Line 1");
    form.set("model", new File([GLB], "cell.glb", { type: "model/gltf-binary" }));
    form.set(
      "partsList",
      new File([PARTS], "parts.json", { type: "application/json" }),
    );

    const pack = await readPackForm(form);
    assert.equal("status" in pack, true);
    if ("status" in pack) {
      assert.equal(pack.status, 413);
      assert.match(pack.error, /S3_/);
    }
  });
});

describe("resolveMachineFileServe", () => {
  after(() => {
    setPersistenceForTests(null);
    setTestS3Objects(null);
    resetStoreMemoryForTests();
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_PUBLIC_BASE_URL;
    delete process.env.VERCEL;
  });

  it("streams from R2 when cross-origin presigned URLs are not allowed", async () => {
    configureS3Env();
    setPersistenceForTests(createMemoryPersistence());
    setTestS3Objects(
      new Map([[modelObjectKey("in-r2.glb"), Buffer.from("from-r2")]]),
    );

    const result = await resolveMachineFileServe({
      storedFileName: "in-r2.glb",
      originalFileName: "in-r2.glb",
      crossOriginObjectUrl: false,
    });
    assert.equal(result.kind, "stream");
    if (result.kind === "stream") {
      assert.equal(result.bytes.toString(), "from-r2");
    }
  });

  it("redirects to a presigned R2 URL when the object exists without a public base", async () => {
    configureS3Env();
    delete process.env.S3_PUBLIC_BASE_URL;
    setPersistenceForTests(createMemoryPersistence());
    setTestS3Objects(
      new Map([[modelObjectKey("in-r2.glb"), Buffer.from("from-r2")]]),
    );

    const result = await resolveMachineFileServe({
      storedFileName: "in-r2.glb",
      originalFileName: "in-r2.glb",
    });
    assert.equal(result.kind, "redirect");
    if (result.kind === "redirect") {
      const parsed = new URL(result.url);
      assert.match(parsed.hostname, /cloudflarestorage\.com$/);
      assert.ok(parsed.searchParams.has("X-Amz-Signature"));
    }
  });

  it("refuses to stream models over 5 MB through Vercel when S3 misses", async () => {
    configureS3Env();
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    setTestS3Objects(new Map());

    const huge = Buffer.alloc(MODEL_PROXY_MAX_BYTES + 1);
    await persistence.writeFileBytes("legacy-xl.glb", huge);

    const result = await resolveMachineFileServe({
      storedFileName: "legacy-xl.glb",
      originalFileName: "legacy-xl.glb",
    });
    assert.equal(result.kind, "error");
    if (result.kind === "error") {
      assert.equal(result.status, 413);
      assert.match(result.message, /backfill-models|re-upload/i);
    }
  });

  it("refuses to stream models over 5 MB through Vercel without S3", async () => {
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    process.env.VERCEL = "1";

    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    const huge = Buffer.alloc(MODEL_PROXY_MAX_BYTES + 1);
    await persistence.writeFileBytes("blob-xl.glb", huge);

    const result = await resolveMachineFileServe({
      storedFileName: "blob-xl.glb",
      originalFileName: "blob-xl.glb",
    });
    assert.equal(result.kind, "error");
    if (result.kind === "error") {
      assert.equal(result.status, 413);
      assert.match(result.message, /S3_/);
    }
  });
});
