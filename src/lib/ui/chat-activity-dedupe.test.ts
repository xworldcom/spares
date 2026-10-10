import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeConsecutiveChatActivities,
  isDuplicateChatActivityPair,
  wouldDuplicateLatestTicketMessage,
} from "./chat-activity-dedupe.ts";

describe("chat activity dedupe", () => {
  it("detects probe-style duplicate rows", () => {
    const first = {
      kind: "message" as const,
      actorEmail: "staff@demo.com",
      actorRole: "staff" as const,
      text: "Only message on a short thread Absolute v6.",
      at: "2026-10-02T05:43:09.565Z",
    };
    const second = {
      ...first,
      at: "2026-10-02T05:43:11.090Z",
    };
    assert.equal(isDuplicateChatActivityPair(first, second), true);
  });

  it("dedupes consecutive identical activities for display", () => {
    const rows = dedupeConsecutiveChatActivities([
      {
        id: "a",
        kind: "message",
        actorEmail: "staff@demo.com",
        actorRole: "staff",
        text: "same",
        at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "b",
        kind: "message",
        actorEmail: "staff@demo.com",
        actorRole: "staff",
        text: "same",
        at: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "c",
        kind: "message",
        actorEmail: "staff@demo.com",
        actorRole: "staff",
        text: "different",
        at: "2026-01-01T00:00:02.000Z",
      },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.id, "a");
    assert.equal(rows[1]?.id, "c");
  });

  it("blocks append when the latest row matches", () => {
    assert.equal(
      wouldDuplicateLatestTicketMessage(
        [
          {
            kind: "message",
            actorEmail: "staff@demo.com",
            actorRole: "staff",
            text: "hello",
            at: new Date().toISOString(),
          },
        ],
        { actorEmail: "staff@demo.com", actorRole: "staff" },
        "hello",
      ),
      true,
    );
  });
});
