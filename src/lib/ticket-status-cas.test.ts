import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServiceTicketRecord } from "@/types";
import { ticketStatusCasWouldConflict } from "./ticket-status-cas.ts";

function ticket(overrides: Partial<ServiceTicketRecord> = {}): ServiceTicketRecord {
  return {
    id: "t1",
    number: 1,
    machineId: "m1",
    title: "T",
    createdAt: "2026-01-01T00:00:00.000Z",
    customerEmail: "u@demo.com",
    customerId: "c1",
    status: "open",
    activities: [],
    lastReadAt: {},
    recordVersion: 2,
    ...overrides,
  };
}

describe("ticket status CAS (C-H1 spec)", () => {
  it("does not conflict on version-only drift when status unchanged", () => {
    const current = ticket({ recordVersion: 4, lastModifiedByUserId: undefined });
    assert.equal(
      ticketStatusCasWouldConflict(
        current,
        { expectedVersion: 2, baseStatus: "open" },
        "staff-a",
      ),
      false,
    );
  });

  it("conflicts when another writer changed the same field", () => {
    const current = ticket({
      status: "in_progress",
      recordVersion: 3,
      lastModifiedByUserId: "staff-a",
      lastModifiedByName: "Staff A",
    });
    assert.equal(
      ticketStatusCasWouldConflict(
        current,
        { expectedVersion: 2, baseStatus: "open" },
        "staff-b",
      ),
      true,
    );
  });

  it("allows same-writer status rebase after their own prior write", () => {
    const current = ticket({
      status: "in_progress",
      recordVersion: 3,
      lastModifiedByUserId: "staff-a",
    });
    assert.equal(
      ticketStatusCasWouldConflict(
        current,
        { expectedVersion: 2, baseStatus: "open" },
        "staff-a",
      ),
      false,
    );
  });
});
