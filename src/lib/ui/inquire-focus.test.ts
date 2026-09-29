import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inquireKeyboardInset, inquireRevealDelta } from "./inquire-focus.ts";

describe("inquire focus", () => {
  it("pads by the keyboard overlap", () => {
    assert.equal(inquireKeyboardInset(844, 520, 0), 324);
    assert.equal(inquireKeyboardInset(844, 844, 0), 0);
  });

  it("scrolls a field that sits under the keyboard or the sticky header", () => {
    assert.equal(inquireRevealDelta({ top: 400, bottom: 466 }, 56, 400), 66);
    assert.equal(inquireRevealDelta({ top: 500, bottom: 640 }, 56, 540), 100);
    assert.equal(inquireRevealDelta({ top: 20, bottom: 70 }, 56, 700), -36);
    assert.equal(inquireRevealDelta({ top: 80, bottom: 140 }, 56, 700), 0);
  });
});
