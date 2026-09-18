import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bugReportWebhookUrl } from "./notify.ts";

describe("bugReportWebhookUrl", () => {
  it("prefers BUG_REPORT_WEBHOOK_URL", () => {
    const prev = process.env.BUG_REPORT_WEBHOOK_URL;
    const prevSpares = process.env.SPARES_BUG_REPORT_WEBHOOK_URL;
    process.env.BUG_REPORT_WEBHOOK_URL = "https://example.test/hook";
    delete process.env.SPARES_BUG_REPORT_WEBHOOK_URL;
    assert.equal(bugReportWebhookUrl(), "https://example.test/hook");
    if (prev === undefined) {
      delete process.env.BUG_REPORT_WEBHOOK_URL;
    } else {
      process.env.BUG_REPORT_WEBHOOK_URL = prev;
    }
    if (prevSpares !== undefined) {
      process.env.SPARES_BUG_REPORT_WEBHOOK_URL = prevSpares;
    }
  });
});
