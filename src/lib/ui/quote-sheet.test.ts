import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initialQuoteSheetSnap } from "./quote-sheet.ts";

describe("quote sheet startup snap", () => {
  it("stays closed when the tray is not open", () => {
    assert.equal(initialQuoteSheetSnap(false, false), "out");
    assert.equal(initialQuoteSheetSnap(false, true), "out");
  });

  it("docks at peek on tablet/phone so the 3D stage stays visible", () => {
    assert.equal(initialQuoteSheetSnap(true, false), "peek");
  });

  it("opens the full side dock on desktop", () => {
    assert.equal(initialQuoteSheetSnap(true, true), "full");
  });
});
