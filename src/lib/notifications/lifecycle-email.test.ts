import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPartObsoleteEmail, lifecycleEmailNotifyEnabled } from "./lifecycle-email.ts";

describe("lifecycle email rough-in", () => {
  it("is off by default", () => {
    const previous = process.env.LIFECYCLE_EMAIL_NOTIFY;
    delete process.env.LIFECYCLE_EMAIL_NOTIFY;
    assert.equal(lifecycleEmailNotifyEnabled(), false);
    if (previous !== undefined) {
      process.env.LIFECYCLE_EMAIL_NOTIFY = previous;
    }
  });

  it("builds obsolete template copy", () => {
    const built = buildPartObsoleteEmail({
      partNumber: "PN-1",
      name: "Pump",
      machineNames: ["Line A", "Line B"],
      discontinuationDate: "2026-12-31",
      successorPartNumber: "PN-1A",
      appUrl: "https://oee360.com/notifications",
      role: "customer",
    });
    assert.match(built.subject, /PN-1/);
    assert.match(built.text, /Line A, Line B/);
    assert.match(built.text, /PN-1A/);
  });
});
