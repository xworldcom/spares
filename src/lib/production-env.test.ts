import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { assertManagedRuntimeEnv, isSeedAllowed } from "./production-env.ts";

describe("isSeedAllowed", () => {
  const envKeys = ["VERCEL", "SPARES_ALLOW_SEED"] as const;
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it("defaults to true off Vercel", () => {
    delete process.env.VERCEL;
    delete process.env.SPARES_ALLOW_SEED;
    assert.equal(isSeedAllowed(), true);
  });

  it("defaults to false on Vercel unless explicitly enabled", () => {
    process.env.VERCEL = "1";
    delete process.env.SPARES_ALLOW_SEED;
    assert.equal(isSeedAllowed(), false);
  });

  it("honors SPARES_ALLOW_SEED=true on Vercel", () => {
    process.env.VERCEL = "1";
    process.env.SPARES_ALLOW_SEED = "true";
    assert.equal(isSeedAllowed(), true);
  });
});

describe("assertManagedRuntimeEnv", () => {
  const envKeys = [
    "VERCEL",
    "AUTH_SECRET",
    "BLOB_READ_WRITE_TOKEN",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ] as const;

  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it("allows local dev without AUTH_SECRET or S3", () => {
    delete process.env.VERCEL;
    delete process.env.AUTH_SECRET;
    assert.doesNotThrow(() => assertManagedRuntimeEnv());
  });

  it("throws on Vercel without AUTH_SECRET", () => {
    process.env.VERCEL = "1";
    delete process.env.AUTH_SECRET;
    assert.throws(() => assertManagedRuntimeEnv(), /AUTH_SECRET must be set/);
  });

  it("throws on Vercel without Blob even when AUTH_SECRET is set", () => {
    process.env.VERCEL = "1";
    process.env.AUTH_SECRET = "preview-secret-not-local-default";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-models";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    assert.throws(() => assertManagedRuntimeEnv(), /BLOB_READ_WRITE_TOKEN is required/);
  });

  it("throws on Vercel without S3 even when AUTH_SECRET and Blob are set", () => {
    process.env.VERCEL = "1";
    process.env.AUTH_SECRET = "preview-secret-not-local-default";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    assert.throws(() => assertManagedRuntimeEnv(), /S3 object storage is required/);
  });

  it("passes when Vercel has AUTH_SECRET, Blob, and full S3 config", () => {
    process.env.VERCEL = "1";
    process.env.AUTH_SECRET = "preview-secret-not-local-default";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-models";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    assert.doesNotThrow(() => assertManagedRuntimeEnv());
  });
});
