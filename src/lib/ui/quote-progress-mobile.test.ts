import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("quote progress mobile layout", () => {
  it("uses fixed-width scrollable steps on narrow viewports", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    assert.match(
      css,
      /@media \(max-width: 639px\)[\s\S]*\.quote-progress-step[\s\S]*flex: 0 0 5rem[\s\S]*min-width: 5rem/,
    );
    assert.match(css, /\.quote-progress-track[\s\S]*touch-action: pan-x/);
  });

  it("does not crush landing workflow quote steps to flex-grow zero", () => {
    const css = readFileSync("src/components/landing/landing.css", "utf8");
    assert.match(css, /\.landing-workflow-request \.quote-progress-track[\s\S]*overflow-x: auto/);
    assert.doesNotMatch(
      css,
      /\.landing-workflow \.quote-progress-step[\s\S]*flex: 1 1 0[\s\S]*min-width: 0/,
    );
  });
});
