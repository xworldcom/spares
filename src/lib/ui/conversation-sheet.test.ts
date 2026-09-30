import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONVERSATION_SHEET_PEEK_CHROME_H,
  CONVERSATION_SHEET_PEEK_H,
  REPLY_DETENT_PX,
  chromeSnapForHeight,
  conversationSheetDragHeight,
  dragComposerLift,
  initialConversationSheetSnap,
} from "./conversation-sheet.ts";

describe("conversation sheet peek band", () => {
  it("uses a fixed peek height independent of message content", () => {
    assert.equal(CONVERSATION_SHEET_PEEK_H, "5.75rem");
    assert.equal(CONVERSATION_SHEET_PEEK_CHROME_H, "2.85rem");
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

  it("uses peek chrome below the midline while opening", () => {
    assert.equal(chromeSnapForHeight(100, heights.peekH, heights.replyH, heights.fullH), "peek");
  });

  it("lifts the composer only when opening or in reply/full chrome", () => {
    assert.equal(dragComposerLift("peek", "peek", -20), true);
    assert.equal(dragComposerLift("peek", "reply", 40), false);
    assert.equal(dragComposerLift("reply", "full", -40), true);
    assert.equal(dragComposerLift("reply", "reply", 40), true);
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
