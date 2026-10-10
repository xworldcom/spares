import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  partLifecycleNoticeText,
  partLifecycleStatusLabel,
} from "./part-lifecycle-copy.ts";

describe("partLifecycleNoticeText", () => {
  it("formats ISO dates for customers", () => {
    const text = partLifecycleNoticeText({
      status: "announced",
      discontinuationDate: "2026-12-31",
      lastTimeBuyDate: "2026-09-30",
    });
    assert.ok(text);
    assert.match(text, /Discontinuation announced/);
    assert.doesNotMatch(text, /2026-12-31/);
    assert.doesNotMatch(text, /2026-09-30/);
    assert.match(text, /Ends /);
    assert.match(text, /Last time buy /);
  });

  it("returns null for active parts", () => {
    assert.equal(partLifecycleNoticeText({ status: "active" }), null);
  });

  it("labels unknown and active for display", () => {
    assert.equal(partLifecycleStatusLabel("unknown"), "Unknown");
    assert.equal(partLifecycleStatusLabel("active"), "Active");
  });
});
