import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { partSheetVisible, shouldAutoDismissPartSheet } from "./part-sheet.ts";

describe("selected-part sheet", () => {
  it("is hidden when nothing is selected so it cannot cover the viewer", () => {
    assert.equal(partSheetVisible(null), false);
    assert.equal(partSheetVisible(undefined), false);
    assert.equal(partSheetVisible(""), false);
    assert.equal(partSheetVisible("PN-FRAME-1000"), true);
  });

  it("auto-dismisses after hide, isolate, and add", () => {
    assert.equal(shouldAutoDismissPartSheet("hide"), true);
    assert.equal(shouldAutoDismissPartSheet("isolate"), true);
    assert.equal(shouldAutoDismissPartSheet("add"), true);
  });
});
