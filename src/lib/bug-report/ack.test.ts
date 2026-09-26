import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUG_REPORT_ACK_MS } from "./ack.ts";

describe("BUG_REPORT_ACK_MS", () => {
  it("is a few seconds", () => {
    assert.ok(BUG_REPORT_ACK_MS >= 2500);
    assert.ok(BUG_REPORT_ACK_MS <= 8000);
  });
});
