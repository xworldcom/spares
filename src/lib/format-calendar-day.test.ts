import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SPARES_DEFAULT_DISPLAY_TIME_ZONE } from "./display-datetime.ts";
import { formatCalendarDay } from "./format-calendar-day.ts";
import { formatWhen } from "./format-when.ts";

describe("formatCalendarDay", () => {
  it("formats YYYY-MM-DD without timezone slip", () => {
    const formatted = formatCalendarDay("2026-09-30");
    assert.match(formatted, /Sep/);
    assert.doesNotMatch(formatted, /2026-09-29/);
  });

  it("matches Toronto instant formatting across calls (hydration parity)", () => {
    const iso = "2026-10-12T01:00:00.000Z";
    assert.equal(
      formatCalendarDay(iso, SPARES_DEFAULT_DISPLAY_TIME_ZONE),
      formatCalendarDay(iso, SPARES_DEFAULT_DISPLAY_TIME_ZONE),
    );
    assert.match(
      formatCalendarDay(iso, SPARES_DEFAULT_DISPLAY_TIME_ZONE),
      /Oct 11/,
    );
  });
});

describe("formatWhen", () => {
  it("uses America/Toronto not UTC for evening ET instants", () => {
    const iso = "2026-10-12T01:00:00.000Z";
    const formatted = formatWhen(iso, SPARES_DEFAULT_DISPLAY_TIME_ZONE);
    assert.match(formatted, /Oct 11/);
    assert.match(formatted, /9:00/);
  });
});
