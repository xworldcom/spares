import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("QuoteTray sheet handle drag", () => {
  it("does not stop pointer propagation on the handle (parent owns drag)", () => {
    const source = readFileSync("src/components/quote/QuoteTray.tsx", "utf8");
    const handleBlock = source.slice(
      source.indexOf('className="quote-sheet-handle"'),
      source.indexOf("onClick={() => {", source.indexOf('className="quote-sheet-handle"')),
    );
    assert.doesNotMatch(handleBlock, /stopPropagation/);
  });
});
