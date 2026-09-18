import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  conversationSheetSnapHeight,
  conversationSheetStep,
  settleConversationSheet,
} from "./conversation-sheet.ts";

const heights = { peekH: 100, composeH: 200, fullH: 700 };

describe("conversation sheet shift-and-roll snaps", () => {
  it("steps peek → compose → full on the way up", () => {
    assert.equal(conversationSheetStep("peek", "up"), "compose");
    assert.equal(conversationSheetStep("compose", "up"), "full");
    assert.equal(conversationSheetStep("full", "up"), "full");
  });

  it("steps full → compose → peek on the way down", () => {
    assert.equal(conversationSheetStep("full", "down"), "compose");
    assert.equal(conversationSheetStep("compose", "down"), "peek");
    assert.equal(conversationSheetStep("peek", "down"), "peek");
  });

  it("settles a short upward pull from peek onto compose, not full", () => {
    assert.equal(
      settleConversationSheet({
        from: "peek",
        dy: -40,
        velocity: -0.2,
        height: 160,
        ...heights,
      }),
      "compose",
    );
  });

  it("settles a long upward pull from peek onto full", () => {
    assert.equal(
      settleConversationSheet({
        from: "peek",
        dy: -400,
        velocity: -0.6,
        height: 520,
        ...heights,
      }),
      "full",
    );
  });

  it("settles a downward pull from full onto compose before peek", () => {
    assert.equal(
      settleConversationSheet({
        from: "full",
        dy: 80,
        velocity: 0.2,
        height: 420,
        ...heights,
      }),
      "compose",
    );
  });

  it("maps snap heights for peek, compose, and full", () => {
    assert.equal(conversationSheetSnapHeight("peek", 100, 200, 700), 100);
    assert.equal(conversationSheetSnapHeight("compose", 100, 200, 700), 200);
    assert.equal(conversationSheetSnapHeight("full", 100, 200, 700), 700);
  });
});
