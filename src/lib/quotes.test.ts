import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeStoredQuote, parseQuoteItems } from "./quotes.ts";

describe("parseQuoteItems", () => {
  it("accepts line items with qty ≥ 1", () => {
    const result = parseQuoteItems([
      { id: "5972K325", qty: 3 },
      { id: "91280A340", qty: 1 },
    ]);
    assert.deepEqual(result, {
      ok: true,
      items: [
        { id: "5972K325", qty: 3 },
        { id: "91280A340", qty: 1 },
      ],
    });
  });

  it("rejects empty arrays, qty below 1, and duplicate ids", () => {
    assert.equal(parseQuoteItems([]).ok, false);
    assert.equal(parseQuoteItems([{ id: "A", qty: 0 }]).ok, false);
    assert.equal(parseQuoteItems([{ id: "A", qty: 1.5 }]).ok, false);
    assert.equal(
      parseQuoteItems([
        { id: "A", qty: 1 },
        { id: "A", qty: 2 },
      ]).ok,
      false,
    );
  });

  it("trims ids and accepts integer strings", () => {
    const result = parseQuoteItems([{ id: "  PN-1  ", qty: "2" }]);
    assert.deepEqual(result, { ok: true, items: [{ id: "PN-1", qty: 2 }] });
  });
});

describe("normalizeStoredQuote", () => {
  it("keeps items and maps legacy partIds to qty 1", () => {
    const modern = normalizeStoredQuote({
      id: "q1",
      machineId: "m1",
      items: [{ id: "A", qty: 3 }],
      createdAt: "2026-01-01T00:00:00.000Z",
      customerEmail: "c@example.test",
    });
    assert.deepEqual(modern.items, [{ id: "A", qty: 3 }]);

    const legacy = normalizeStoredQuote({
      id: "q2",
      machineId: "m1",
      items: [],
      partIds: ["A", "B"],
      createdAt: "2026-01-01T00:00:00.000Z",
      customerEmail: "c@example.test",
    } as never);
    assert.deepEqual(legacy.items, [
      { id: "A", qty: 1 },
      { id: "B", qty: 1 },
    ]);
  });
});
