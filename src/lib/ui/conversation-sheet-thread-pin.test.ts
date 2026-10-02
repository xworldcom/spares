import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { threadScrollerFitsViewport, threadScrollerMaxScroll } from "./conversation-sheet-thread-pin.ts";

describe("conversation sheet thread pin", () => {
  it("uses scrollHeight minus clientHeight for max scroll", () => {
    const body = {
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 0,
    } as HTMLElement;
    assert.equal(threadScrollerMaxScroll(body), 800);
  });

  it("short thread in auto scroller has zero max scroll", () => {
    const body = {
      scrollHeight: 320,
      clientHeight: 480,
      scrollTop: 0,
    } as HTMLElement;
    assert.equal(threadScrollerMaxScroll(body), 0);
    assert.equal(threadScrollerFitsViewport(body), true);
  });
});
