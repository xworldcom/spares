import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONVERSATION_SHEET_CLOSE_FONT_PX,
  CONVERSATION_SHEET_DRAG_HANDLE_H_REM,
  CONVERSATION_SHEET_DRAG_HANDLE_W_REM,
  CONVERSATION_SHEET_PEEK_CHROME_H,
  CONVERSATION_SHEET_PEEK_H,
  CONVERSATION_SHEET_REPLY_H,
  CONVERSATION_SHEET_TITLE_FONT_PX,
  chromeSnapForHeight,
  conversationSheetDragHeight,
  conversationSheetMotionFromHeight,
  conversationSheetSnapFromHeight,
  initialConversationSheetSnap,
} from "./conversation-sheet.ts";

describe("conversation sheet peek band", () => {
  it("uses a fixed peek height independent of message content", () => {
    assert.equal(CONVERSATION_SHEET_PEEK_H, "5.75rem");
    assert.equal(CONVERSATION_SHEET_PEEK_CHROME_H, "2.85rem");
    assert.equal(CONVERSATION_SHEET_REPLY_H, "17.5rem");
  });

  it("locks chrome typography and handle geometry tokens", () => {
    assert.equal(CONVERSATION_SHEET_TITLE_FONT_PX, 15);
    assert.equal(CONVERSATION_SHEET_CLOSE_FONT_PX, 14);
    assert.equal(CONVERSATION_SHEET_DRAG_HANDLE_W_REM, 2.6);
    assert.equal(CONVERSATION_SHEET_DRAG_HANDLE_H_REM, 0.28);
  });
});

describe("conversation sheet startup snap", () => {
  it("stays closed when the sheet is not open", () => {
    assert.equal(initialConversationSheetSnap(false, false), "out");
    assert.equal(initialConversationSheetSnap(false, true), "out");
  });

  it("starts at peek on phone overlay", () => {
    assert.equal(initialConversationSheetSnap(true, false), "peek");
  });

  it("starts at full on phone when the thread is unread", () => {
    assert.equal(initialConversationSheetSnap(true, false, true), "full");
  });

  it("opens at peek on desktop overlay tray", () => {
    assert.equal(initialConversationSheetSnap(true, true), "peek");
  });

  it("opens at reply in desktop split-pane inline column", () => {
    assert.equal(initialConversationSheetSnap(true, true, false, true), "reply");
  });
});

const heights = { peekH: 280, replyH: 280, fullH: 700 };

describe("conversation sheet roll-up", () => {
  it("grows continuously from intermediate toward full", () => {
    assert.equal(
      conversationSheetDragHeight({
        from: "reply",
        startH: heights.replyH,
        dy: -80,
        ...heights,
      }),
      360,
    );
    assert.equal(
      conversationSheetDragHeight({
        from: "reply",
        startH: heights.replyH,
        dy: -(heights.fullH - heights.replyH),
        ...heights,
      }),
      heights.fullH,
    );
  });

  it("maps live height to reply / full chrome while dragging", () => {
    assert.equal(chromeSnapForHeight(280, heights.peekH, heights.replyH, heights.fullH), "reply");
    assert.equal(chromeSnapForHeight(500, heights.peekH, heights.replyH, heights.fullH), "full");
  });

  it("maps height to roll-up motion (composer glued, phaseA pinned)", () => {
    assert.deepEqual(
      conversationSheetMotionFromHeight(280, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 1, phaseB: 0 },
    );
    assert.deepEqual(
      conversationSheetMotionFromHeight(490, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 1, phaseB: 0.5 },
    );
    assert.deepEqual(
      conversationSheetMotionFromHeight(700, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 1, phaseB: 1 },
    );
  });

  it("derives snap labels from height without drag hysteresis", () => {
    assert.equal(
      conversationSheetSnapFromHeight(280, heights.peekH, heights.replyH, heights.fullH),
      "reply",
    );
    assert.equal(
      conversationSheetSnapFromHeight(500, heights.peekH, heights.replyH, heights.fullH),
      "full",
    );
    assert.equal(
      conversationSheetSnapFromHeight(700, heights.peekH, heights.replyH, heights.fullH),
      "full",
    );
  });
});
