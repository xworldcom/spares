import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ASSISTANT_EMAIL } from "../assistant/actor.ts";
import { messageActorLabel } from "./message-actor-label.ts";

const customer = { email: "user@demo.com", role: "customer" as const };
const staff = { email: "staff@spares.local", role: "staff" as const };

describe("messageActorLabel", () => {
  it("labels the viewer's own messages as You", () => {
    assert.equal(
      messageActorLabel(
        {
          kind: "message",
          actorEmail: customer.email,
          actorRole: "customer",
        },
        customer,
      ),
      "You",
    );
  });

  it("does not use a generic tenant slug for customer viewers", () => {
    const label = messageActorLabel(
      {
        kind: "message",
        actorEmail: staff.email,
        actorRole: "staff",
      },
      customer,
    );
    assert.equal(label, "Staff");
    assert.notEqual(label.toLowerCase(), "spares");
  });

  it("derives counterpart names for staff viewers", () => {
    assert.equal(
      messageActorLabel(
        {
          kind: "message",
          actorEmail: customer.email,
          actorRole: "customer",
        },
        staff,
      ),
      "User",
    );
  });

  it("prefers profile names when provided", () => {
    assert.equal(
      messageActorLabel(
        {
          kind: "message",
          actorEmail: customer.email,
          actorRole: "customer",
        },
        staff,
        { [customer.email]: "Pat Demo" },
      ),
      "Pat Demo",
    );
  });

  it("labels assistant messages", () => {
    assert.equal(
      messageActorLabel(
        {
          kind: "message",
          actorEmail: ASSISTANT_EMAIL,
          actorRole: "assistant",
        },
        customer,
      ),
      "AI",
    );
  });
});
