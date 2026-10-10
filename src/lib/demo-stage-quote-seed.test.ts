import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEMO_STAGE_QUOTE_IDS,
  buildDemoStageQuoteRecord,
} from "./demo-stage-quote-seed.ts";
import { quoteFulfillmentVisibility } from "./quotes.ts";

describe("demo stage quote seed", () => {
  it("builds post-PO pipeline quotes with fulfillment fields", () => {
    const base = {
      tenantId: "tenant-oee360-host",
      machineId: "hardware-fixture",
      customerId: "user-customer",
      customerEmail: "user@demo.com",
      staffEmail: "staff@demo.com",
      createdAt: "2026-10-10T12:00:00.000Z",
      number: 40,
    };

    const po = buildDemoStageQuoteRecord({
      ...base,
      quoteId: DEMO_STAGE_QUOTE_IDS.po_received,
      key: "po_received",
    });
    assert.equal(po.status, "po_received");
    assert.equal(po.poNumber, "DEMO-PO-367");
    assert.deepEqual(quoteFulfillmentVisibility(po), {
      po: true,
      invoice: true,
      tracking: true,
    });

    const shipped = buildDemoStageQuoteRecord({
      ...base,
      quoteId: DEMO_STAGE_QUOTE_IDS.shipped,
      key: "shipped",
      number: 43,
    });
    assert.equal(shipped.status, "shipped");
    assert.ok(shipped.shipments[0]?.trackingNumber);
    assert.equal(
      quoteFulfillmentVisibility(shipped).tracking,
      true,
    );
  });
});
