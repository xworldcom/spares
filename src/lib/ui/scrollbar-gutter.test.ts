import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("scrollbar gutter (layout shift)", () => {
  it("reserves stable gutter on signed-in app shell", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    assert.match(
      css,
      /html:has\(\.spares-app-stage\):not\(:has\(\.spares-app-cinematic\)\)[\s\S]*scrollbar-gutter:\s*stable/,
    );
    assert.match(css, /\.imsg-thread[\s\S]*scrollbar-gutter:\s*stable/);
  });
});
