import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayChatMessageText } from "./chat-message-text.ts";

describe("displayChatMessageText", () => {
  it("collapses long blank runs between text", () => {
    const raw = "trhdjrdgfg\n\n\n\n\n\n\n\n\n\n\n\n\n\nhsdlkjfsdk";
    assert.equal(displayChatMessageText(raw), "trhdjrdgfg\n\nhsdlkjfsdk");
  });

  it("preserves single line breaks", () => {
    assert.equal(displayChatMessageText("line one\nline two"), "line one\nline two");
  });
});
