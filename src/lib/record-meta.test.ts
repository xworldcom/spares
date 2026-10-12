import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fieldsOverlap,
  quoteChangedFields,
  readRecordVersion,
  stampQuoteRecord,
  stampTicketRecord,
  ticketChangedFields,
} from "./record-meta.ts";
import type { ServiceTicketRecord } from "@/types";
import type { QuoteRecord } from "@/types";

function sampleQuote(overrides: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: "q1",
    number: 1,
    machineId: "m1",
    items: [{ id: "p1", qty: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
    customerEmail: "c@demo.com",
    customerId: "c1",
    status: "requested",
    shipments: [],
    activities: [],
    lastReadAt: {},
    ...overrides,
  };
}

describe("record-meta", () => {
  it("detects overlapping quote field edits", () => {
    const base = sampleQuote({ recordVersion: 2 });
    const server = sampleQuote({ recordVersion: 3, status: "pricing" });
    const clientNext = sampleQuote({ status: "quoted" });
    const serverFields = quoteChangedFields(base, server);
    const clientFields = quoteChangedFields(base, clientNext);
    assert.equal(fieldsOverlap(serverFields, clientFields), true);
  });

  it("bumps record version on meaningful quote edits", () => {
    const before = sampleQuote({ recordVersion: 4 });
    const after = sampleQuote({ status: "pricing" });
    const stamped = stampQuoteRecord(before, after, {
      id: "staff",
      email: "staff@demo.com",
      name: "Staff",
    });
    assert.equal(readRecordVersion(stamped), 5);
    assert.equal(stamped.lastModifiedByName, "Staff");
  });

  it("does not bump ticket record version on read-watermark-only edits", () => {
    const before: ServiceTicketRecord = {
      id: "t1",
      number: 9,
      machineId: "m1",
      title: "Ticket 9",
      createdAt: "2026-01-01T00:00:00.000Z",
      customerEmail: "user@demo.com",
      customerId: "c1",
      status: "open",
      activities: [],
      lastReadAt: {},
      recordVersion: 2,
      lastModifiedByName: "Staff A",
      lastModifiedByUserId: "staff-a",
    };
    const after: ServiceTicketRecord = {
      ...before,
      lastReadAt: { staff: "2026-01-02T00:00:00.000Z" },
    };
    const stamped = stampTicketRecord(before, after);
    assert.equal(readRecordVersion(stamped), 2);
    assert.equal(stamped.lastModifiedByName, "Staff A");
  });

  it("does not treat read-watermark version drift as a status conflict", () => {
    const base: ServiceTicketRecord = {
      id: "t1",
      number: 9,
      machineId: "m1",
      title: "Ticket 9",
      createdAt: "2026-01-01T00:00:00.000Z",
      customerEmail: "user@demo.com",
      customerId: "c1",
      status: "open",
      activities: [],
      lastReadAt: {},
      recordVersion: 2,
    };
    const server: ServiceTicketRecord = {
      ...base,
      recordVersion: 3,
      lastReadAt: { staff: "2026-01-02T00:00:00.000Z" },
    };
    const overlap = fieldsOverlap(ticketChangedFields(base, server), ["status"]);
    assert.equal(overlap, false);
  });
});
