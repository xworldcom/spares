import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conversationPeekLine } from "./conversation-peek.ts";
import type { QuoteActivity } from "../../types/index.ts";

const self = { email: "me@example.com", role: "customer" as const };

function message(text: string, email = "other@example.com"): QuoteActivity {
  return {
    id: "1",
    at: new Date().toISOString(),
    actorRole: "staff",
    actorEmail: email,
    kind: "message",
    text,
  };
}

describe("conversationPeekLine", () => {
  it("returns the latest non-empty message text", () => {
    const line = conversationPeekLine(
      [message("Hello"), message("Latest line")],
      self,
    );
    assert.equal(line.text, "Latest line");
  });

  it("falls back when the thread is empty", () => {
    const line = conversationPeekLine([], self);
    assert.equal(line.text, "No messages yet");
  });
});
