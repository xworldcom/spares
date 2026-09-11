import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignMissingQuoteNumbers,
  canEditTracking,
  canUploadPo,
  isQuoteUnreadForUser,
  itemsForRole,
  mergeQuoteItems,
  normalizeStoredQuote,
  parseQuoteItems,
  parseShipments,
  pricesVisibleToCustomer,
  quoteItemsEqual,
  quotePricingComplete,
  quoteStatusCaption,
  quoteStepState,
  shippedActivityText,
  toPublicQuote,
} from "./quotes.ts";
import type { QuoteRecord } from "../types/index.ts";

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

  it("parses staff pricing fields", () => {
    const result = parseQuoteItems(
      [
        {
          id: "A",
          qty: 2,
          sellPrice: "12.5",
          supplierCost: 8,
          supplier: "McMaster",
          leadTimeDays: 5,
          note: "stock",
        },
      ],
      { allowPricing: true },
    );
    assert.deepEqual(result, {
      ok: true,
      items: [
        {
          id: "A",
          qty: 2,
          sellPrice: 12.5,
          supplierCost: 8,
          supplier: "McMaster",
          leadTimeDays: 5,
          note: "stock",
        },
      ],
    });
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
    } as never);
    assert.deepEqual(modern.items, [{ id: "A", qty: 3 }]);
    assert.equal(modern.status, "requested");
    assert.deepEqual(modern.activities, []);
    assert.deepEqual(modern.shipments, []);

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

  it("maps legacy unitPrice to sellPrice", () => {
    const quote = normalizeStoredQuote({
      id: "q3",
      machineId: "m1",
      items: [{ id: "A", qty: 1, unitPrice: 9.99 }],
      createdAt: "2026-01-01T00:00:00.000Z",
      customerEmail: "c@example.test",
    } as never);
    assert.equal(quote.items[0]?.sellPrice, 9.99);
  });

  it("coerces string sell prices from legacy storage", () => {
    const quote = normalizeStoredQuote({
      id: "q4",
      machineId: "m1",
      items: [{ id: "A", qty: 1, sellPrice: "24.50" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      customerEmail: "c@example.test",
    } as never);
    assert.equal(quote.items[0]?.sellPrice, 24.5);
  });
});

describe("status and visibility", () => {
  it("allows PO upload from quoted onward, not before or when cancelled", () => {
    assert.equal(canUploadPo("requested"), false);
    assert.equal(canUploadPo("pricing"), false);
    assert.equal(canUploadPo("quoted"), true);
    assert.equal(canUploadPo("ordered"), true);
    assert.equal(canUploadPo("shipped"), true);
    assert.equal(canUploadPo("cancelled"), false);
  });

  it("shows customer prices after quoted", () => {
    assert.equal(pricesVisibleToCustomer("pricing"), false);
    assert.equal(pricesVisibleToCustomer("quoted"), true);
    assert.equal(pricesVisibleToCustomer("delivered"), true);
  });

  it("lets staff edit tracking at ordered or shipped", () => {
    assert.equal(canEditTracking("confirmed"), false);
    assert.equal(canEditTracking("ordered"), true);
    assert.equal(canEditTracking("shipped"), true);
    assert.equal(canEditTracking("delivered"), false);
  });

  it("maps pipeline steps without inventing a second state machine", () => {
    assert.equal(quoteStepState("requested", "requested"), "current");
    assert.equal(quoteStepState("pricing", "requested"), "done");
    assert.equal(quoteStepState("pricing", "quoted"), "todo");
    assert.equal(quoteStepState("confirmed", "confirmed"), "current");
    assert.equal(quoteStepState("cancelled", "quoted"), "todo");
  });

  it("writes a calm caption for the current quote status", () => {
    assert.equal(quoteStatusCaption("pricing", "customer"), "Staff is pricing…");
    assert.equal(quoteStatusCaption("quoted", "customer"), "Waiting for your PO");
    assert.equal(quoteStatusCaption("quoted", "staff"), "Quoted. Waiting for a PO.");
    assert.equal(quoteStatusCaption("cancelled"), "This quote was cancelled.");
  });
});

describe("parseShipments", () => {
  it("requires a tracking number and fills carrier URLs", () => {
    assert.equal(parseShipments([]).ok, false);
    const parsed = parseShipments([{ trackingNumber: "1Z999", carrier: "UPS" }]);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.shipments[0]?.trackingNumber, "1Z999");
      assert.match(parsed.shipments[0]?.trackingUrl ?? "", /ups\.com/);
    }
  });
});

describe("role-aware items and unread", () => {
  const record: QuoteRecord = {
    id: "q1",
    number: 1,
    machineId: "m1",
    items: [
      {
        id: "A",
        name: "Bearing",
        qty: 2,
        sellPrice: 20,
        supplierCost: 11,
        supplier: "McMaster",
        leadTimeDays: 4,
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    customerEmail: "c@example.test",
    customerId: "cust-1",
    status: "pricing",
    shipments: [],
    activities: [
      {
        id: "a1",
        at: "2026-01-01T01:00:00.000Z",
        actorRole: "customer",
        actorEmail: "c@example.test",
        kind: "status",
        text: "Status set to Requested.",
      },
    ],
    lastReadAt: { "cust-1": "2026-01-01T01:00:00.000Z" },
  };

  it("hides cost and sell price from the customer before quoted", () => {
    const items = itemsForRole(record.items, "customer", "pricing");
    assert.deepEqual(items, [{ id: "A", name: "Bearing", qty: 2 }]);
  });

  it("shows sell price but not supplier cost after quoted", () => {
    const items = itemsForRole(record.items, "customer", "quoted");
    assert.deepEqual(items, [
      { id: "A", name: "Bearing", qty: 2, sellPrice: 20, leadTimeDays: 4 },
    ]);
  });

  it("maps legacy unitPrice for customers after quoted", () => {
    const legacy = [
      { id: "A", name: "Bearing", qty: 2, unitPrice: 20, leadTimeDays: 4 },
    ];
    const items = itemsForRole(legacy, "customer", "quoted");
    assert.equal(items[0]?.sellPrice, 20);
  });

  it("marks a new quote unread for staff and read for the customer", () => {
    assert.equal(
      isQuoteUnreadForUser(record, {
        id: "staff-1",
        email: "staff@spares.local",
        role: "staff",
      }),
      true,
    );
    assert.equal(
      isQuoteUnreadForUser(record, {
        id: "cust-1",
        email: "c@example.test",
        role: "customer",
      }),
      false,
    );
  });

  it("strips cost from the public customer quote", () => {
    const quoted = { ...record, status: "quoted" as const };
    const publicQuote = toPublicQuote(quoted, {
      id: "cust-1",
      email: "c@example.test",
      role: "customer",
    });
    assert.equal(publicQuote.items[0]?.sellPrice, 20);
    assert.equal(publicQuote.items[0]?.supplierCost, undefined);
    assert.equal(publicQuote.customerEmail, "c@example.test");
  });
});

describe("quoteItemsEqual", () => {
  it("treats identical pricing as unchanged", () => {
    const items = [{ id: "A", qty: 2, sellPrice: 10 }];
    assert.equal(quoteItemsEqual(items, [{ id: "A", qty: 2, sellPrice: 10 }]), true);
    assert.equal(quoteItemsEqual(items, [{ id: "A", qty: 3, sellPrice: 10 }]), false);
  });
});

describe("mergeQuoteItems and numbers", () => {
  it("updates pricing on existing lines only", () => {
    const merged = mergeQuoteItems(
      [{ id: "A", qty: 1 }],
      [{ id: "A", qty: 3, sellPrice: 4 }],
    );
    assert.deepEqual(merged, {
      ok: true,
      items: [{ id: "A", qty: 3, sellPrice: 4 }],
    });
    assert.equal(
      mergeQuoteItems([{ id: "A", qty: 1 }], [{ id: "B", qty: 1 }]).ok,
      false,
    );
  });

  it("assigns sequential numbers to quotes that lack them", () => {
    const numbered = assignMissingQuoteNumbers([
      {
        id: "b",
        number: 0,
        machineId: "m",
        items: [],
        createdAt: "2026-01-02T00:00:00.000Z",
        customerEmail: "c@example.test",
        customerId: "c",
        status: "requested",
        shipments: [],
        activities: [],
        lastReadAt: {},
      },
      {
        id: "a",
        number: 0,
        machineId: "m",
        items: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        customerEmail: "c@example.test",
        customerId: "c",
        status: "requested",
        shipments: [],
        activities: [],
        lastReadAt: {},
      },
    ]);
    assert.equal(numbered.find((row) => row.id === "a")?.number, 1);
    assert.equal(numbered.find((row) => row.id === "b")?.number, 2);
  });
});

describe("quotePricingComplete", () => {
  it("requires a real sell price on every line", () => {
    assert.equal(
      quotePricingComplete([{ id: "A", qty: 1, sellPrice: 10 }]),
      true,
    );
    assert.equal(quotePricingComplete([{ id: "A", qty: 1, sellPrice: 0 }]), false);
    assert.equal(quotePricingComplete([{ id: "A", qty: 1 }]), false);
    assert.equal(quotePricingComplete([]), false);
  });
});

describe("shipped activity copy", () => {
  it("reads Shipped — tracking …", () => {
    assert.equal(
      shippedActivityText([{ id: "s1", trackingNumber: "1Z999", carrier: "UPS" }]),
      "Shipped — tracking 1Z999 (UPS)",
    );
  });
});
