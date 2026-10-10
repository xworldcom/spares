import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSendChatMessage } from "./chat-composer.ts";

describe("chat composer send guard", () => {
  it("blocks whitespace-only text without attachments", () => {
    assert.equal(canSendChatMessage("", 0), false);
    assert.equal(canSendChatMessage("   \n\t", 0), false);
  });

  it("allows text or attachments", () => {
    assert.equal(canSendChatMessage("hi", 0), true);
    assert.equal(canSendChatMessage("", 1), true);
  });
});
