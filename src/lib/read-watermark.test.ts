import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readWatermarkNow } from "./read-watermark.ts";

describe("readWatermarkNow", () => {
  it("uses now when there are no activities", () => {
    const stamp = readWatermarkNow([]);
    assert.match(stamp, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("never trails the latest activity timestamp", () => {
    const latest = "2099-01-01T00:00:00.000Z";
    assert.equal(readWatermarkNow([{ at: latest }]), latest);
  });
});
