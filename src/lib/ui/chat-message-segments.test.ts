import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expandActivitiesForChatDisplay,
  segmentChatMessageText,
} from "./chat-message-segments.ts";

describe("segmentChatMessageText", () => {
  it("splits iOS-coalesced bodies on paragraph breaks", () => {
    const raw = "trhdjrdgfg\n\n\n\n\n\n\n\n\n\n\n\n\n\nhsdlkjfsdk";
    assert.deepEqual(segmentChatMessageText(raw), ["trhdjrdgfg", "hsdlkjfsdk"]);
  });

  it("keeps single-paragraph messages intact", () => {
    assert.deepEqual(segmentChatMessageText("line one\nline two"), ["line one\nline two"]);
  });
});

describe("expandActivitiesForChatDisplay", () => {
  it("expands one stored row into stacked display rows", () => {
    const rows = expandActivitiesForChatDisplay([
      {
        id: "a1",
        at: "2026-01-01T00:00:00.000Z",
        actorRole: "customer",
        actorEmail: "user@demo.com",
        kind: "message",
        text: "first\n\n\nsecond",
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.text, "first");
    assert.equal(rows[1]?.text, "second");
    assert.equal(rows[0]?.displayKey, "a1~0");
    assert.equal(rows[1]?.displayKey, "a1~1");
  });
});
