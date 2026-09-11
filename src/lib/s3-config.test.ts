import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  DEFAULT_UPLOAD_URL_TTL_SECONDS,
  MAX_SIGNED_URL_TTL_SECONDS,
  modelDownloadUrlTtlSeconds,
  modelUploadUrlTtlSeconds,
} from "./s3-config.ts";

describe("signed URL TTL", () => {
  afterEach(() => {
    delete process.env.S3_SIGNED_URL_TTL_SECONDS;
  });

  it("defaults GET TTL to one hour and caps overrides", () => {
    delete process.env.S3_SIGNED_URL_TTL_SECONDS;
    assert.equal(modelDownloadUrlTtlSeconds(), DEFAULT_SIGNED_URL_TTL_SECONDS);
    process.env.S3_SIGNED_URL_TTL_SECONDS = "86400";
    assert.equal(modelDownloadUrlTtlSeconds(), MAX_SIGNED_URL_TTL_SECONDS);
    process.env.S3_SIGNED_URL_TTL_SECONDS = "0";
    assert.equal(modelDownloadUrlTtlSeconds(), DEFAULT_SIGNED_URL_TTL_SECONDS);
  });

  it("keeps staff PUT tickets shorter than GET URLs", () => {
    assert.equal(modelUploadUrlTtlSeconds(), DEFAULT_UPLOAD_URL_TTL_SECONDS);
    assert.ok(modelUploadUrlTtlSeconds() <= modelDownloadUrlTtlSeconds());
  });
});
