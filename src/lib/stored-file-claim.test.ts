import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chatKeyClaimed,
  manualFileNameClaimed,
  modelFileNameClaimed,
} from "./stored-file-claim.ts";

describe("stored file claims", () => {
  it("treats a basename already on another machine as claimed", () => {
    const machines = [
      { id: "host", storedFileName: "palletizer.glb" },
      { id: "sat", storedFileName: "sat.glb" },
    ];
    assert.equal(modelFileNameClaimed(machines, "palletizer.glb"), true);
    assert.equal(modelFileNameClaimed(machines, "palletizer.glb", "host"), false);
    assert.equal(modelFileNameClaimed(machines, "new.glb"), false);
    assert.equal(
      modelFileNameClaimed(
        [
          { id: "bare-1", storedFileName: "" },
          { id: "bare-2", storedFileName: "" },
        ],
        "",
      ),
      false,
    );
  });

  it("treats a manual basename already on another row as claimed", () => {
    const manuals = [
      { id: "m1", storedFileName: "guide.pdf" },
      { id: "m2", storedFileName: "other.pdf" },
    ];
    assert.equal(manualFileNameClaimed(manuals, "guide.pdf"), true);
    assert.equal(manualFileNameClaimed(manuals, "guide.pdf", "m1"), false);
  });

  it("treats a chat key on another quote or ticket as claimed", () => {
    const key = "chat/chat-550e8400-e29b-41d4-a716-446655440000.png";
    const quotes = [
      {
        id: "q-a",
        activities: [{ attachments: [{ r2Key: key }] }],
      },
    ];
    const tickets = [{ id: "t-b", activities: [] }];
    assert.equal(chatKeyClaimed(quotes, tickets, key, { quoteId: "q-b" }), true);
    assert.equal(chatKeyClaimed(quotes, tickets, key, { quoteId: "q-a" }), false);
  });
});
