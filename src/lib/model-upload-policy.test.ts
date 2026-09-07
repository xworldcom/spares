import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  blobUploadMaxBytes,
  modelUploadTicketFailedMessage,
  resolveModelUploadStrategy,
  s3MultipartRefusedMessage,
  vercelRequiresObjectStorageMessage,
} from "./model-upload-policy.ts";
import {
  CLIENT_PACK_MAX_BYTES,
  MODEL_PROXY_MAX_BYTES,
} from "./pack-limits.ts";

describe("resolveModelUploadStrategy", () => {
  it("uses S3 presigned upload when s3Upload is true", () => {
    const strategy = resolveModelUploadStrategy(
      {
        clientUpload: false,
        s3Upload: true,
        maxBytes: CLIENT_PACK_MAX_BYTES,
        vercelRuntime: true,
      },
      80 * 1024 * 1024,
    );
    assert.equal(strategy.mode, "s3");
  });

  it("refuses when the availability ticket cannot be loaded", () => {
    const strategy = resolveModelUploadStrategy(null, 1024);
    assert.equal(strategy.mode, "refuse");
    if (strategy.mode === "refuse") {
      assert.equal(strategy.message, modelUploadTicketFailedMessage());
      assert.equal(strategy.status, 503);
    }
  });

  it("never falls back to blob or multipart when S3 is configured", () => {
    const strategy = resolveModelUploadStrategy(
      {
        clientUpload: true,
        s3Upload: true,
        maxBytes: CLIENT_PACK_MAX_BYTES,
      },
      1024,
    );
    assert.equal(strategy.mode, "s3");
  });

  it("refuses large GLBs on Vercel without S3", () => {
    const strategy = resolveModelUploadStrategy(
      {
        clientUpload: true,
        s3Upload: false,
        maxBytes: MODEL_PROXY_MAX_BYTES,
        vercelRuntime: true,
      },
      MODEL_PROXY_MAX_BYTES + 1,
    );
    assert.equal(strategy.mode, "refuse");
    if (strategy.mode === "refuse") {
      assert.match(strategy.message, /S3_/);
      assert.equal(strategy.status, 413);
    }
  });

  it("allows Blob client upload for small GLBs on Vercel without S3", () => {
    const strategy = resolveModelUploadStrategy(
      {
        clientUpload: true,
        s3Upload: false,
        maxBytes: MODEL_PROXY_MAX_BYTES,
        vercelRuntime: true,
      },
      MODEL_PROXY_MAX_BYTES,
    );
    assert.equal(strategy.mode, "blob");
  });

  it("refuses Vercel without S3 or Blob", () => {
    const strategy = resolveModelUploadStrategy(
      {
        clientUpload: false,
        s3Upload: false,
        maxBytes: MODEL_PROXY_MAX_BYTES,
        vercelRuntime: true,
      },
      1024,
    );
    assert.equal(strategy.mode, "refuse");
    if (strategy.mode === "refuse") {
      assert.equal(strategy.message, vercelRequiresObjectStorageMessage());
      assert.equal(strategy.status, 503);
    }
  });

  it("allows local multipart fallback when storage is not attached", () => {
    const strategy = resolveModelUploadStrategy(
      {
        clientUpload: false,
        s3Upload: false,
        maxBytes: CLIENT_PACK_MAX_BYTES,
        vercelRuntime: false,
      },
      1024,
    );
    assert.equal(strategy.mode, "multipart");
  });
});

describe("blobUploadMaxBytes", () => {
  it("caps Blob client uploads at 5 MB on Vercel without S3", () => {
    assert.equal(
      blobUploadMaxBytes({
        clientUpload: true,
        s3Upload: false,
        maxBytes: CLIENT_PACK_MAX_BYTES,
        vercelRuntime: true,
      }),
      MODEL_PROXY_MAX_BYTES,
    );
  });

  it("keeps the 256 MB ceiling when S3 is configured", () => {
    assert.equal(
      blobUploadMaxBytes({
        clientUpload: false,
        s3Upload: true,
        maxBytes: CLIENT_PACK_MAX_BYTES,
        vercelRuntime: true,
      }),
      CLIENT_PACK_MAX_BYTES,
    );
  });
});

describe("s3MultipartRefusedMessage", () => {
  it("tells staff not to send GLBs through the server", () => {
    assert.match(s3MultipartRefusedMessage(), /object storage/i);
    assert.match(s3MultipartRefusedMessage(), /presigned/i);
  });
});
