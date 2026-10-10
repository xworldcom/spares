import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("PartLifecycleNotice contrast tokens", () => {
  it("uses dark at-risk colors on light BOM rows", () => {
    const source = readFileSync("src/components/part-lifecycle/PartLifecycleNotice.tsx", "utf8");
    assert.match(source, /onLightBackground/);
    assert.match(source, /#8b2e28/);
    assert.match(source, /#7a4a12/);
    assert.match(source, /#ffe4c2/);
  });
});
