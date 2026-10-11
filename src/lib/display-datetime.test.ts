import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SPARES_DEFAULT_DISPLAY_TIME_ZONE,
  resolveDisplayTimeZone,
} from "./display-datetime.ts";

describe("resolveDisplayTimeZone", () => {
  it("defaults to America/Toronto", () => {
    assert.equal(resolveDisplayTimeZone(), SPARES_DEFAULT_DISPLAY_TIME_ZONE);
    assert.equal(resolveDisplayTimeZone(null), SPARES_DEFAULT_DISPLAY_TIME_ZONE);
    assert.equal(resolveDisplayTimeZone(""), SPARES_DEFAULT_DISPLAY_TIME_ZONE);
  });

  it("accepts valid IANA zones", () => {
    assert.equal(resolveDisplayTimeZone("Europe/London"), "Europe/London");
  });

  it("rejects invalid zones", () => {
    assert.equal(resolveDisplayTimeZone("Not/A_Zone"), SPARES_DEFAULT_DISPLAY_TIME_ZONE);
  });
});
