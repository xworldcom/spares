import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LARGE_UNCOMPRESSED_BYTES,
  validateLargeModelCompression,
} from "./gltf-compress.ts";

describe("large model compression guardrails", () => {
  it("allows small models even when compression does not run", () => {
    const result = validateLargeModelCompression(1024, {
      bytes: Buffer.alloc(1024),
      compressed: false,
      originalSize: 1024,
      finalSize: 1024,
    });
    assert.equal(result.ok, true);
  });

  it("rejects large models when compression did not succeed", () => {
    const originalSize = LARGE_UNCOMPRESSED_BYTES + 1;
    const result = validateLargeModelCompression(originalSize, {
      bytes: Buffer.alloc(originalSize),
      compressed: false,
      originalSize,
      finalSize: originalSize,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /could not be compressed enough/i);
    }
  });

  it("allows large models when compression succeeded", () => {
    const originalSize = LARGE_UNCOMPRESSED_BYTES + 1;
    const result = validateLargeModelCompression(originalSize, {
      bytes: Buffer.alloc(1024),
      compressed: true,
      originalSize,
      finalSize: 1024,
    });
    assert.equal(result.ok, true);
  });
});
