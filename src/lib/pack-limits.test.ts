import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_PACK_MAX_BYTES,
  formatMegabytes,
  machineBlobPathname,
  packOverLimitMessage,
  storedFileNameFromUploadPath,
} from "./pack-limits.ts";

describe("pack size copy", () => {
  it("formats megabytes for staff-facing errors", () => {
    assert.equal(formatMegabytes(49 * 1024 * 1024), "49");
    assert.equal(formatMegabytes(1.5 * 1024 * 1024), "1.5");
    assert.equal(formatMegabytes(256 * 1024 * 1024), "256");
  });

  it("names the hard ceiling in plain English", () => {
    const message = packOverLimitMessage(300 * 1024 * 1024, CLIENT_PACK_MAX_BYTES);
    assert.match(message, /300 MB/);
    assert.match(message, /256 MB/);
    assert.match(message, /smaller GLB/i);
  });
});

describe("storedFileNameFromUploadPath", () => {
  it("accepts a bare uuid filename and a files/ prefix", () => {
    assert.equal(
      storedFileNameFromUploadPath("a1b2c3d4-e5f6-7890-abcd-ef1234567890.glb"),
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890.glb",
    );
    assert.equal(
      storedFileNameFromUploadPath("spares/files/pack.gltf"),
      "pack.gltf",
    );
    assert.equal(
      machineBlobPathname("pack.glb"),
      "spares/files/pack.glb",
    );
  });

  it("rejects path traversal and the database object", () => {
    assert.throws(() => storedFileNameFromUploadPath("../db.json"));
    assert.throws(() => storedFileNameFromUploadPath("spares/db.json"));
    assert.throws(() => storedFileNameFromUploadPath("spares/files/../db.json"));
    assert.throws(() => storedFileNameFromUploadPath(""));
  });
});
