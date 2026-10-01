import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONVERSATION_SHEET_CLOSE_FONT_PX,
  CONVERSATION_SHEET_DRAG_HANDLE_H_REM,
  CONVERSATION_SHEET_DRAG_HANDLE_W_REM,
  CONVERSATION_SHEET_PEEK_CHROME_H,
  CONVERSATION_SHEET_PEEK_H,
  CONVERSATION_SHEET_TITLE_FONT_PX,
  REPLY_DETENT_PX,
  chromeSnapForHeight,
  conversationSheetDragHeight,
  conversationSheetMotionFromHeight,
  conversationSheetPaintedHeight,
  conversationSheetSnapFromHeight,
  initialConversationSheetSnap,
} from "./conversation-sheet.ts";

describe("conversation sheet peek band", () => {
  it("uses a fixed peek height independent of message content", () => {
    assert.equal(CONVERSATION_SHEET_PEEK_H, "5.75rem");
    assert.equal(CONVERSATION_SHEET_PEEK_CHROME_H, "2.85rem");
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

  it("starts at peek on phone so the latest context stays visible", () => {
    assert.equal(initialConversationSheetSnap(true, false), "peek");
  });

  it("starts at reply on phone when the thread is unread", () => {
    assert.equal(initialConversationSheetSnap(true, false, true), "reply");
  });

  it("opens at reply on desktop overlay so the composer is ready", () => {
    assert.equal(initialConversationSheetSnap(true, true), "reply");
  });
});

const heights = { peekH: 92, replyH: 200, fullH: 700 };

/**
 * Firefox (#197): drag the sheet by `.snap-sheet-handle` on a mobile viewport
 * (`/staff/quotes/<n>`). Chromium bubbles pointer events from the handle button;
 * Firefox does not — the sheet root uses `onPointerDownCapture` in useSnapSheet.
 *
 * Playwright smoke (after `control-oee360 launch`):
 * `page.locator('.snap-sheet-handle').hover(); page.mouse.down(); page.mouse.move(x, y-40); page.mouse.up();`
 * expect `[data-snap="reply"]`.
 */
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

  it("maps live height to peek / reply / full chrome while dragging", () => {
    assert.equal(chromeSnapForHeight(80, heights.peekH, heights.replyH, heights.fullH), "peek");
    assert.equal(chromeSnapForHeight(150, heights.peekH, heights.replyH, heights.fullH), "reply");
    assert.equal(chromeSnapForHeight(500, heights.peekH, heights.replyH, heights.fullH), "full");
  });

  it("keeps reply chrome until the peek band when collapsing", () => {
    assert.equal(
      chromeSnapForHeight(150, heights.peekH, heights.replyH, heights.fullH, {
        collapsing: true,
      }),
      "reply",
    );
    assert.equal(
      chromeSnapForHeight(94, heights.peekH, heights.replyH, heights.fullH, {
        collapsing: true,
      }),
      "peek",
    );
  });

  it("keeps peek chrome until the reply midline when expanding", () => {
    assert.equal(
      chromeSnapForHeight(100, heights.peekH, heights.replyH, heights.fullH, {
        expanding: true,
      }),
      "peek",
    );
    assert.equal(
      chromeSnapForHeight(150, heights.peekH, heights.replyH, heights.fullH, {
        expanding: true,
      }),
      "reply",
    );
    assert.equal(
      chromeSnapForHeight(500, heights.peekH, heights.replyH, heights.fullH, {
        expanding: true,
      }),
      "full",
    );
  });

  it("uses peek chrome below the midline while opening", () => {
    assert.equal(chromeSnapForHeight(100, heights.peekH, heights.replyH, heights.fullH), "peek");
  });

  it("keeps the outer shell at full height while collapsing through phase B", () => {
    assert.equal(
      conversationSheetPaintedHeight(450, heights.peekH, heights.replyH, heights.fullH, "expanding"),
      450,
    );
    assert.equal(
      conversationSheetPaintedHeight(450, heights.peekH, heights.replyH, heights.fullH, "collapsing"),
      heights.fullH,
    );
    assert.equal(
      conversationSheetPaintedHeight(150, heights.peekH, heights.replyH, heights.fullH, "collapsing"),
      150,
    );
    assert.equal(
      conversationSheetPaintedHeight(450, heights.peekH, heights.replyH, heights.fullH, null),
      450,
    );
  });

  it("maps height to two-phase motion (composer then thread roll)", () => {
    assert.deepEqual(
      conversationSheetMotionFromHeight(92, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 0, phaseB: 0 },
    );
    assert.deepEqual(
      conversationSheetMotionFromHeight(146, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 0.5, phaseB: 0 },
    );
    assert.deepEqual(
      conversationSheetMotionFromHeight(200, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 1, phaseB: 0 },
    );
    assert.deepEqual(
      conversationSheetMotionFromHeight(450, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 1, phaseB: 0.5 },
    );
    assert.deepEqual(
      conversationSheetMotionFromHeight(700, heights.peekH, heights.replyH, heights.fullH),
      { phaseA: 1, phaseB: 1 },
    );
  });

  it("derives snap labels from height without drag hysteresis", () => {
    assert.equal(
      conversationSheetSnapFromHeight(92, heights.peekH, heights.replyH, heights.fullH),
      "peek",
    );
    assert.equal(
      conversationSheetSnapFromHeight(140, heights.peekH, heights.replyH, heights.fullH),
      "reply",
    );
    assert.equal(
      conversationSheetSnapFromHeight(500, heights.peekH, heights.replyH, heights.fullH),
      "reply",
    );
    assert.equal(
      conversationSheetSnapFromHeight(700, heights.peekH, heights.replyH, heights.fullH),
      "full",
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
