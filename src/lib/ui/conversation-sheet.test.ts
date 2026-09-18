import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initialConversationSheetSnap } from "./conversation-sheet.ts";

describe("conversation sheet startup snap", () => {
  it("stays closed when the sheet is not open", () => {
    assert.equal(initialConversationSheetSnap(false, false), "out");
    assert.equal(initialConversationSheetSnap(false, true), "out");
  });

  it("starts at peek on phone so the latest context stays visible", () => {
    assert.equal(initialConversationSheetSnap(true, false), "peek");
  });

  it("opens at reply on desktop overlay so the composer is ready", () => {
    assert.equal(initialConversationSheetSnap(true, true), "reply");
  });
});
