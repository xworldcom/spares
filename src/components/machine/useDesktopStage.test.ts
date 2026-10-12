import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONVERSATION_DOCK_STAGE,
  DESKTOP_STAGE,
} from "./useDesktopStage.ts";

describe("layout stage media queries", () => {
  it("keeps wide split panes at tablet width", () => {
    assert.match(DESKTOP_STAGE, /1024/);
    assert.doesNotMatch(DESKTOP_STAGE, /pointer/);
  });

  it("requires fine pointer before side-docking Care/quote chat", () => {
    assert.match(CONVERSATION_DOCK_STAGE, /1024/);
    assert.match(CONVERSATION_DOCK_STAGE, /pointer:\s*fine/);
  });
});
