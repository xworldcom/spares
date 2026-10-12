import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TENANT_ID } from "./tenant.ts";
import {
  isDemoCustomerHiddenTicketNumber,
  isDemoGateTicketTitle,
  ticketHiddenFromCustomer,
} from "./demo-customer-visibility.ts";

describe("demo customer ticket visibility", () => {
  it("marks only gate ticket numbers 1–8 and 17–34", () => {
    assert.equal(isDemoCustomerHiddenTicketNumber(8), true);
    assert.equal(isDemoCustomerHiddenTicketNumber(9), false);
    assert.equal(isDemoCustomerHiddenTicketNumber(16), false);
    assert.equal(isDemoCustomerHiddenTicketNumber(17), true);
    assert.equal(isDemoCustomerHiddenTicketNumber(34), true);
    assert.equal(isDemoCustomerHiddenTicketNumber(35), false);
  });

  it("hides CAS gate titles and ignores stale hidden flags on story tickets", () => {
    assert.equal(isDemoGateTicketTitle("CAS s1 gate test"), true);
    assert.equal(
      ticketHiddenFromCustomer(
        { number: 17, title: "CAS s1 something", tenantId: DEFAULT_TENANT_ID },
        DEFAULT_TENANT_ID,
      ),
      true,
    );
    assert.equal(
      ticketHiddenFromCustomer(
        {
          number: 9,
          title: "The robot keeps crashing",
          hiddenFromCustomer: true,
          tenantId: DEFAULT_TENANT_ID,
        },
        DEFAULT_TENANT_ID,
      ),
      false,
    );
    assert.equal(
      ticketHiddenFromCustomer(
        { number: 40, title: "Palletizer belt slip", tenantId: DEFAULT_TENANT_ID },
        DEFAULT_TENANT_ID,
      ),
      false,
    );
  });
});
