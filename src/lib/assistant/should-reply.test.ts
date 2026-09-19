import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldAssistantReply, shouldForceEscalate } from "./should-reply.ts";

const customerNote = {
  kind: "message" as const,
  actorRole: "customer",
  actorEmail: "buyer@plant.test",
  text: "HMI shows E-14",
};

const staffNote = {
  kind: "message" as const,
  actorRole: "staff",
  actorEmail: "tech@host.test",
  text: "Checking now",
};

const aiNote = {
  kind: "message" as const,
  actorRole: "assistant",
  actorEmail: "ai@oee360.local",
  text: "That code is in the operator manual.",
};

describe("shouldAssistantReply", () => {
  it("stays off when the platform switch is off", () => {
    assert.equal(
      shouldAssistantReply({
        enabled: false,
        paused: false,
        trigger: customerNote,
        activities: [customerNote],
      }),
      false,
    );
  });

  it("stays quiet after a thread is escalated", () => {
    assert.equal(
      shouldAssistantReply({
        enabled: true,
        paused: true,
        trigger: customerNote,
        activities: [customerNote],
      }),
      false,
    );
  });

  it("replies to a customer message", () => {
    assert.equal(
      shouldAssistantReply({
        enabled: true,
        paused: false,
        trigger: customerNote,
        activities: [customerNote],
      }),
      true,
    );
  });

  it("does not jump into staff chatter unless someone mentions AI", () => {
    assert.equal(
      shouldAssistantReply({
        enabled: true,
        paused: false,
        trigger: staffNote,
        activities: [customerNote, staffNote],
      }),
      false,
    );
    assert.equal(
      shouldAssistantReply({
        enabled: true,
        paused: false,
        trigger: { ...staffNote, text: "AI, what part is this?" },
        activities: [customerNote, { ...staffNote, text: "AI, what part is this?" }],
      }),
      true,
    );
  });

  it("never replies to its own message", () => {
    assert.equal(
      shouldAssistantReply({
        enabled: true,
        paused: false,
        trigger: aiNote,
        activities: [customerNote, aiNote],
      }),
      false,
    );
  });

  it("does not double-reply when the last note is already from AI", () => {
    assert.equal(
      shouldAssistantReply({
        enabled: true,
        paused: false,
        trigger: customerNote,
        activities: [customerNote, aiNote],
      }),
      false,
    );
  });
});

describe("shouldForceEscalate", () => {
  it("catches an operator asking for a person", () => {
    assert.equal(shouldForceEscalate("Can I talk to a real person?"), true);
    assert.equal(shouldForceEscalate("please escalate this"), true);
    assert.equal(shouldForceEscalate("HMI shows E-14"), false);
  });
});
