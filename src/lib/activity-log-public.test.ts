import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ACTIVITY_LOG_ENABLED, isActivityLogEnabled } from "./activity-log-public.ts";

describe("activity log pause flag", () => {
  afterEach(() => {
    delete process.env.SPARES_ACTIVITY_LOG;
  });

  it("is paused in product code", () => {
    assert.equal(ACTIVITY_LOG_ENABLED, false);
  });

  it("honors SPARES_ACTIVITY_LOG over the default", () => {
    process.env.SPARES_ACTIVITY_LOG = "true";
    assert.equal(isActivityLogEnabled(), true);
    process.env.SPARES_ACTIVITY_LOG = "false";
    assert.equal(isActivityLogEnabled(), false);
  });
});
