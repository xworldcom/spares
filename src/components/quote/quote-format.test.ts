import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDay } from "./quote-format.ts";

describe("formatDay", () => {
  it("parses calendar-only ISO dates at local noon", () => {
    const formatted = formatDay("2026-09-30");
    assert.ok(formatted);
    assert.doesNotMatch(formatted, /2026-09-29/);
    assert.match(formatted, /Sep/);
  });

  it("returns em dash for empty values", () => {
    assert.equal(formatDay(), "—");
    assert.equal(formatDay(""), "—");
  });
});
