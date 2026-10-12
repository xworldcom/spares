import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeTicketPollState, ticketPollMetaInSync } from "./merge-ticket-poll.ts";
import type { ServiceTicket } from "@/types";

const base: ServiceTicket = {
  id: "t1",
  number: 9,
  machineId: "m1",
  title: "Test",
  status: "open",
  createdAt: "2026-01-01T00:00:00.000Z",
  customerEmail: "a@b.c",
  activities: [],
  unread: false,
  recordVersion: 2,
};

describe("mergeTicketPollState", () => {
  it("syncs record meta from the server row", () => {
    const next: ServiceTicket = {
      ...base,
      recordVersion: 5,
      lastModifiedAt: "2026-10-11T00:00:00.000Z",
      lastModifiedByName: "Demo staff",
      status: "in_progress",
    };
    const merged = mergeTicketPollState(base, next, next.activities);
    assert.equal(merged.recordVersion, 5);
    assert.equal(merged.lastModifiedByName, "Demo staff");
    assert.equal(merged.status, "in_progress");
    assert.notEqual(base.recordVersion, 5);
  });

  it("detects meta drift for poll early-exit", () => {
    const next = { ...base, recordVersion: 3 };
    assert.equal(ticketPollMetaInSync(base, next), false);
    assert.equal(ticketPollMetaInSync(base, base), true);
  });
});
