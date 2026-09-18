import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPOSE_DETENT_PX,
  conversationSheetDragHeight,
  conversationSheetMetrics,
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

  it("sizes compose as peek plus the typing row", () => {
    const next = conversationSheetMetrics({
      handleH: 28,
      threadPeekH: 108,
      composerH: 72,
      viewportH: 844,
    });
    assert.equal(next.peekH, 136);
    assert.equal(next.composeH, 208);
    assert.ok(next.fullH > next.composeH);
  });

  it("maps snap heights for peek, compose, and full", () => {
    assert.equal(conversationSheetSnapHeight("peek", 100, 200, 700), 100);
    assert.equal(conversationSheetSnapHeight("compose", 100, 200, 700), 200);
    assert.equal(conversationSheetSnapHeight("full", 100, 200, 700), 700);
  });

  it("holds the first peek pull at compose instead of overshooting into rollout", () => {
    assert.equal(
      conversationSheetDragHeight({
        from: "peek",
        dy: -40,
        ...heights,
      }),
      140,
    );
    assert.equal(
      conversationSheetDragHeight({
        from: "peek",
        dy: -100,
        ...heights,
      }),
      200,
    );
    assert.equal(
      conversationSheetDragHeight({
        from: "peek",
        dy: -(100 + COMPOSE_DETENT_PX),
        ...heights,
      }),
      200,
    );
    assert.equal(
      conversationSheetDragHeight({
        from: "peek",
        dy: -(100 + COMPOSE_DETENT_PX + 80),
        ...heights,
      }),
      280,
    );
  });

  it("grows from compose toward full without a compose detent", () => {
    assert.equal(
      conversationSheetDragHeight({
        from: "compose",
        dy: -80,
        ...heights,
      }),
      280,
    );
  });
});
