import assert from "node:assert/strict";
import test from "node:test";
import { trayCountLabel } from "./tray-count-label.ts";

test("trayCountLabel", () => {
  assert.equal(trayCountLabel(0, 0), "");
  assert.equal(trayCountLabel(1, 1), "1 line · 1 unit");
  assert.equal(trayCountLabel(2, 2), "2 lines · 2 units");
  assert.equal(trayCountLabel(2, 3), "2 lines · 3 units");
});
