import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstUnreadActivityIndex } from "./conversation-unread.ts";

const staff = { email: "staff@spares.local", role: "staff" as const };
const customer = { email: "customer@spares.local", role: "customer" as const };

describe("firstUnreadActivityIndex", () => {
  it("returns the first foreign message after the watermark", () => {
    const activities = [
      {
        id: "a1",
        at: "2026-01-01T00:00:00.000Z",
        actorRole: "customer" as const,
        actorEmail: "customer@spares.local",
        kind: "message" as const,
        text: "Hi",
      },
      {
        id: "a2",
        at: "2026-01-02T00:00:00.000Z",
        actorRole: "staff" as const,
        actorEmail: "staff@spares.local",
        kind: "message" as const,
        text: "On it",
      },
      {
        id: "a3",
        at: "2026-01-03T00:00:00.000Z",
        actorRole: "customer" as const,
        actorEmail: "customer@spares.local",
        kind: "message" as const,
        text: "Thanks",
      },
    ];
    assert.equal(
      firstUnreadActivityIndex(activities, staff, "2026-01-02T01:00:00.000Z"),
      2,
    );
    assert.equal(
      firstUnreadActivityIndex(activities, customer, "2026-01-01T01:00:00.000Z"),
      1,
    );
  });

  it("returns null when everything is read", () => {
    const activities = [
      {
        id: "a1",
        at: "2026-01-02T00:00:00.000Z",
        actorRole: "staff" as const,
        actorEmail: "staff@spares.local",
        kind: "message" as const,
        text: "Done",
      },
    ];
    assert.equal(
      firstUnreadActivityIndex(activities, customer, "2026-01-03T00:00:00.000Z"),
      null,
    );
  });
});
