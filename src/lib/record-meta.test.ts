import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fieldsOverlap,
  quoteChangedFields,
  readRecordVersion,
  stampQuoteRecord,
} from "./record-meta.ts";
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
});
