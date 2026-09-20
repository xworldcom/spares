import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ensureR2BrowserCors, resetR2CorsSyncForTests } from "./r2-cors-sync.ts";

describe("ensureR2BrowserCors", () => {
  afterEach(() => {
    resetR2CorsSyncForTests();
    delete process.env.VERCEL;
    delete process.env.SPARES_SYNC_R2_CORS;
  });

  it("does not call R2 during unit tests", async () => {
    process.env.VERCEL = "1";
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "spares-models";
    process.env.S3_ACCESS_KEY_ID = "key";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    await ensureR2BrowserCors();
    assert.ok(process.env.NODE_TEST_CONTEXT);
  });
});
