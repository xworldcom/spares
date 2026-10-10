import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conversationThreadSubtitle } from "./conversation-thread-subtitle.ts";

describe("conversationThreadSubtitle", () => {
  it("labels the plant contact for staff", () => {
    assert.equal(
      conversationThreadSubtitle("staff", {
        customerEmail: "user@demo.com",
        machineName: "Palletizer",
      }),
      "User · Palletizer",
    );
  });

  it("labels the OEM for customers", () => {
    assert.equal(conversationThreadSubtitle("customer", {}), "Spares");
  });
});
