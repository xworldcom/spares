import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONVERSATION_POLL_MS } from "./conversation-poll-constants.ts";

describe("conversation poll constants", () => {
  it("refreshes open threads within the 1–2s peer delivery bar", () => {
    assert.ok(CONVERSATION_POLL_MS >= 1000);
    assert.ok(CONVERSATION_POLL_MS <= 2000);
  });
});
