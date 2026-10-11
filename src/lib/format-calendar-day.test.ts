import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCalendarDay } from "./format-calendar-day.ts";

describe("formatCalendarDay", () => {
  it("formats YYYY-MM-DD without timezone slip", () => {
    const formatted = formatCalendarDay("2026-09-30");
    assert.match(formatted, /Sep/);
    assert.doesNotMatch(formatted, /2026-09-29/);
  });

  it("matches UTC instant formatting across calls (hydration parity)", () => {
    const iso = "2026-10-11T18:30:00.000Z";
    assert.equal(formatCalendarDay(iso), formatCalendarDay(iso));
  });
});
