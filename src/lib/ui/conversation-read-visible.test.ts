import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conversationReadVisible } from "./conversation-read-visible.ts";

describe("conversationReadVisible", () => {
  it("treats inline desktop as always visible", () => {
    assert.equal(conversationReadVisible("peek", "inline", true), true);
    assert.equal(conversationReadVisible("out", "inline", true), true);
  });

  it("waits for reply or full on mobile overlay", () => {
    assert.equal(conversationReadVisible("peek", "overlay", false), false);
    assert.equal(conversationReadVisible("out", "overlay", false), false);
    assert.equal(conversationReadVisible("reply", "overlay", false), true);
    assert.equal(conversationReadVisible("full", "overlay", false), true);
  });
});
