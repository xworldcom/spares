import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONVERSATION_DOCK_STAGE,
  DESKTOP_STAGE,
  QUOTE_CONVERSATION_DOCK_STAGE,
} from "./useDesktopStage.ts";

describe("layout stage media queries", () => {
  it("keeps wide split panes at tablet width", () => {
    assert.match(DESKTOP_STAGE, /1024/);
    assert.doesNotMatch(DESKTOP_STAGE, /pointer/);
  });

  it("requires xl width and fine pointer before side-docking Care chat", () => {
    assert.match(CONVERSATION_DOCK_STAGE, /1536/);
    assert.match(CONVERSATION_DOCK_STAGE, /pointer:\s*fine/);
  });

  it("side-docks quote Messages from 1280px", () => {
    assert.match(QUOTE_CONVERSATION_DOCK_STAGE, /1280/);
    assert.match(QUOTE_CONVERSATION_DOCK_STAGE, /pointer:\s*fine/);
  });
});
