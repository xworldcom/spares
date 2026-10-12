import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TENANT_ID } from "./tenant.ts";
import { isDemoGateTicketTitle, ticketHiddenFromCustomer } from "./demo-customer-visibility.ts";

describe("demo customer ticket visibility", () => {
  it("hides CAS gate titles and tickets 1–26 on demo host", () => {
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
        { number: 40, title: "Real customer issue", tenantId: DEFAULT_TENANT_ID },
        DEFAULT_TENANT_ID,
      ),
      false,
    );
  });
});
