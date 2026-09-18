import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REPLY_DETENT_PX,
  conversationSheetDragHeight,
  initialConversationSheetSnap,
} from "./conversation-sheet.ts";

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

const heights = { peekH: 92, replyH: 200, fullH: 700 };

describe("conversation sheet staged pull-up", () => {
  it("holds the first peek pull at reply instead of overshooting into rollout", () => {
    assert.equal(
      conversationSheetDragHeight({
        from: "peek",
        startH: heights.peekH,
        dy: -40,
        ...heights,
      }),
      132,
    );
    assert.equal(
      conversationSheetDragHeight({
        from: "peek",
        startH: heights.peekH,
        dy: -(heights.replyH - heights.peekH),
        ...heights,
      }),
      heights.replyH,
    );
    assert.equal(
      conversationSheetDragHeight({
        from: "peek",
        startH: heights.peekH,
        dy: -(heights.replyH - heights.peekH + REPLY_DETENT_PX),
        ...heights,
      }),
      heights.replyH,
    );
    assert.equal(
      conversationSheetDragHeight({
        from: "peek",
        startH: heights.peekH,
        dy: -(heights.replyH - heights.peekH + REPLY_DETENT_PX + 80),
        ...heights,
      }),
      heights.replyH,
    );
  });

  it("grows from reply toward full without a reply detent", () => {
    assert.equal(
      conversationSheetDragHeight({
        from: "reply",
        startH: heights.replyH,
        dy: -80,
        ...heights,
      }),
      280,
    );
  });
});
