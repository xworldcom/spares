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
  resolveConversationSheetDetents,
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

  it("starts at closed peek on phone", () => {
    assert.equal(initialConversationSheetSnap(true, false), "peek");
  });

  it("starts at full on phone when the thread is unread", () => {
    assert.equal(initialConversationSheetSnap(true, false, true), "full");
  });

  it("opens at reply on desktop overlay so the composer is ready", () => {
    assert.equal(initialConversationSheetSnap(true, true), "reply");
  });
});

const heights = { peekH: 92, replyH: 280, fullH: 700 };

describe("conversation sheet detents on short viewports", () => {
  it("keeps reply below full with a phase-B band", () => {
    const detents = resolveConversationSheetDetents(190, 469, 502, 67);
    assert.ok(detents.replyH < detents.fullH);
    assert.ok(detents.replyH >= 190 + 67 + 8);
    assert.ok(detents.fullH - detents.replyH >= 56);
  });

  it("clamps an oversized measured reply onto the short screen", () => {
    const detents = resolveConversationSheetDetents(144, 438, 438, 67);
    assert.equal(detents.fullH, 438);
    assert.ok(detents.replyH < 438);
    assert.ok(detents.replyH >= 144 + 67);
  });
});

describe("conversation sheet two-phase motion", () => {
  it("phase A seats the composer before roll-up", () => {
    assert.deepEqual(
      conversationSheetMotionFromHeight(92, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 0, phaseB: 0 },
    );
    assert.deepEqual(
      conversationSheetMotionFromHeight(186, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 0.5, phaseB: 0 },
    );
    assert.deepEqual(
      conversationSheetMotionFromHeight(280, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 1, phaseB: 0 },
    );
  });

  it("phase B rolls history after reply detent", () => {
    assert.deepEqual(
      conversationSheetMotionFromHeight(490, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 1, phaseB: 0.5 },
    );
    assert.deepEqual(
      conversationSheetMotionFromHeight(700, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 1, phaseB: 1 },
    );
  });

  it("grows continuously from reply toward full", () => {
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
        from: "peek",
        startH: heights.peekH,
        dy: -40,
        ...heights,
      }),
      132,
    );
  });

  it("maps live height to peek / reply / full chrome while dragging", () => {
    assert.equal(chromeSnapForHeight(92, heights.peekH, heights.replyH, heights.fullH), "peek");
    assert.equal(chromeSnapForHeight(280, heights.peekH, heights.replyH, heights.fullH), "reply");
    assert.equal(chromeSnapForHeight(500, heights.peekH, heights.replyH, heights.fullH), "full");
  });

  it("derives snap labels from height without drag hysteresis", () => {
    assert.equal(
      conversationSheetSnapFromHeight(92, heights.peekH, heights.replyH, heights.fullH),
      "peek",
    );
    assert.equal(
      conversationSheetSnapFromHeight(280, heights.peekH, heights.replyH, heights.fullH),
      "reply",
    );
    assert.equal(
      conversationSheetSnapFromHeight(700, heights.peekH, heights.replyH, heights.fullH),
      "full",
    );
  });
});
