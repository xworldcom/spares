import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignMissingQuoteNumbers,
  findQuoteInList,
  canEditTracking,
  canUploadPo,
  invoiceVisible,
  isQuoteUnreadForUser,
  itemsForRole,
  mergeQuoteItems,
  normalizeStoredQuote,
  hydrateQuoteItems,
  parseQuoteItems,
  parseShipments,
  pricesVisibleToCustomer,
  quoteItemsEqual,
  quotePricingComplete,
  quoteHasReached,
  quoteOwnerIdForCreate,
  staffQuoteAccountMatch,
  quotePoNextStep,
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

  it("rejects an oversized part id and keeps a typed OEM number", () => {
    assert.deepEqual(parseQuoteItems([{ id: "A".repeat(80), qty: 1 }]), {
      ok: true,
      items: [{ id: "A".repeat(80), qty: 1 }],
    });
    assert.equal(parseQuoteItems([{ id: "A".repeat(81), qty: 1 }]).ok, false);
    assert.deepEqual(parseQuoteItems([{ id: "A06B-0115-H002", qty: 1 }]), {
      ok: true,
      items: [{ id: "A06B-0115-H002", qty: 1 }],
    });
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

describe("quoteOwnerIdForCreate", () => {
  it("lets staff name a customer owner and keeps a customer on their own id", () => {
    assert.deepEqual(quoteOwnerIdForCreate("customer", "user-buyer", "someone-else"), {
      ok: true,
      customerId: "user-buyer",
    });
    assert.deepEqual(quoteOwnerIdForCreate("staff", "user-staff", "user-buyer"), {
      ok: true,
      customerId: "user-buyer",
    });
    assert.deepEqual(quoteOwnerIdForCreate("staff", "user-staff", "  "), {
      ok: false,
      error: "Pick a customer for this quote.",
    });
  });

  it("rejects a machine on another customer account", () => {
    assert.deepEqual(staffQuoteAccountMatch("customer-cargill", "customer-cargill"), {
      ok: true,
    });
    assert.deepEqual(staffQuoteAccountMatch("customer-scotts", "customer-throwaway"), {
      ok: false,
      error: "That machine belongs to a different customer.",
    });
    assert.deepEqual(staffQuoteAccountMatch("", "customer-cargill"), {
      ok: false,
      error: "This person has no customer yet.",
    });
  });
});

describe("hydrateQuoteItems", () => {
  it("keeps catalog metadata and accepts a part that is not on the machine", () => {
    const items = hydrateQuoteItems(
      [
        { id: "PN-100", qty: 2 },
        { id: "OEM-9", name: "Third-party seal", qty: 1 },
      ],
      [{ id: "PN-100", name: "Pump", meshName: "PN-100", qty: 1, vendor: "Acme" }],
    );
    assert.deepEqual(items, [
      { id: "PN-100", qty: 2, name: "Pump", vendor: "Acme" },
      { id: "OEM-9", qty: 1, name: "Third-party seal" },
    ]);
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

  it("keeps chat attachments on message activities", () => {
    const quote = normalizeStoredQuote({
      id: "q5",
      machineId: "m1",
      items: [{ id: "A", qty: 1 }],
      createdAt: "2026-01-01T00:00:00.000Z",
      customerEmail: "c@example.test",
      activities: [
        {
          id: "act-1",
          at: "2026-09-14T00:00:00.000Z",
          actorRole: "customer",
          actorEmail: "c@example.test",
          kind: "message",
          text: "",
          attachments: [
            {
              id: "att-1",
              filename: "photo.png",
              contentType: "image/png",
              sizeBytes: 1200,
              r2Key: "chat/chat-550e8400-e29b-41d4-a716-446655440000.png",
              createdAt: "2026-09-14T00:00:00.000Z",
            },
          ],
        },
      ],
    } as never);
    assert.equal(quote.activities.length, 1);
    assert.equal(quote.activities[0]?.attachments?.[0]?.filename, "photo.png");
  });

  it("keeps AI chat messages", () => {
    const quote = normalizeStoredQuote({
      id: "q-ai",
      machineId: "m1",
      items: [{ id: "A", qty: 1 }],
      createdAt: "2026-01-01T00:00:00.000Z",
      customerEmail: "c@example.test",
      activities: [
        {
          id: "act-ai",
          at: "2026-09-19T00:00:00.000Z",
          actorRole: "assistant",
          actorEmail: "ai@oee360.local",
          kind: "message",
          text: "That part is PN-MTR-1 on the BOM.",
        },
      ],
    } as never);
    assert.equal(quote.activities[0]?.actorRole, "assistant");
    assert.equal(quote.activities[0]?.text, "That part is PN-MTR-1 on the BOM.");
  });

  it("round-trips every QuoteRecord field through a catalog load", () => {
    const full = {
      id: "q6",
      number: 6,
      machineId: "m1",
      items: [{ id: "A", qty: 2, name: "Bearing", sellPrice: 12.5, supplierCost: 4 }],
      note: "freight $75",
      createdAt: "2026-01-01T00:00:00.000Z",
      customerEmail: "c@example.test",
      customerId: "cust-1",
      tenantId: "tenant-other-host",
      status: "closed" as const,
      poNumber: "PO-1",
      poStoredFileName: "po-1.pdf",
      poOriginalFileName: "po.pdf",
      poUploadedAt: "2026-01-02T00:00:00.000Z",
      shipments: [
        {
          id: "ship-1",
          trackingNumber: "1Z999",
          carrier: "UPS" as const,
        },
      ],
      activities: [
        {
          id: "act-1",
          at: "2026-01-01T00:00:00.000Z",
          actorRole: "staff" as const,
          actorEmail: "s@example.test",
          kind: "status" as const,
          text: "Closed",
        },
      ],
      lastReadAt: { "cust-1": "2026-01-02T00:00:00.000Z" },
      invoiceNumber: "INV-1042",
    };
    const quote = normalizeStoredQuote(full as never);
    assert.deepEqual(Object.keys(quote).sort(), Object.keys(full).sort());
    assert.equal(quote.invoiceNumber, "INV-1042");
    assert.equal(quote.tenantId, "tenant-other-host");
    assert.equal(quote.poNumber, "PO-1");
    assert.equal(quote.note, "freight $75");
    assert.equal(quote.shipments[0]?.carrier, "UPS");
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

  it("shows invoice only after PO is received, using the existing pipeline", () => {
    assert.equal(quoteHasReached("quoted", "po_received"), false);
    assert.equal(quoteHasReached("po_received", "po_received"), true);
    assert.equal(quoteHasReached("confirmed", "po_received"), true);
    assert.equal(quoteHasReached("cancelled", "po_received"), false);

    assert.equal(invoiceVisible("requested"), false);
    assert.equal(invoiceVisible("in_review"), false);
    assert.equal(invoiceVisible("pricing"), false);
    assert.equal(invoiceVisible("quoted"), false);
    assert.equal(invoiceVisible("po_received"), true);
    assert.equal(invoiceVisible("confirmed"), true);
    assert.equal(invoiceVisible("ordered"), true);
    assert.equal(invoiceVisible("shipped"), true);
    assert.equal(invoiceVisible("delivered"), true);
    assert.equal(invoiceVisible("closed"), true);
    assert.equal(invoiceVisible("cancelled"), false);
  });

  it("names the PO as the next step while invoice is still closed", () => {
    assert.equal(
      quotePoNextStep("pricing", "staff"),
      "PO number and PDF upload open after this quote is issued.",
    );
    assert.equal(
      quotePoNextStep("quoted", "staff"),
      "Waiting for the customer PO. Invoice opens after PO is received.",
    );
    assert.equal(
      quotePoNextStep("quoted", "customer"),
      "Add your PO number and PDF to proceed.",
    );
    assert.equal(quotePoNextStep("po_received", "staff"), null);
    assert.equal(quotePoNextStep("cancelled", "staff"), null);
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

  it("marks a quote unread for the customer after staff activity", () => {
    const withStaffReply = {
      ...record,
      activities: [
        {
          id: "a1",
          at: "2026-01-01T00:00:00.000Z",
          actorRole: "customer",
          actorEmail: "c@example.test",
          kind: "message",
          text: "Need bearings",
        },
        {
          id: "a2",
          at: "2026-01-02T00:00:00.000Z",
          actorRole: "staff",
          actorEmail: "staff@spares.local",
          kind: "message",
          text: "Quoted today",
        },
      ],
      lastReadAt: { "cust-1": "2026-01-01T01:00:00.000Z" },
    };
    const customer = {
      id: "cust-1",
      email: "c@example.test",
      role: "customer" as const,
    };
    assert.equal(isQuoteUnreadForUser(withStaffReply, customer), true);
    const publicQuotes = [toPublicQuote(withStaffReply, customer)];
    assert.equal(publicQuotes.filter((quote) => quote.unread).length, 1);
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

  it("omits invoiceNumber from the public quote until PO is received", () => {
    const withInvoice = {
      ...record,
      status: "quoted" as const,
      invoiceNumber: "INV-1042",
    };
    const quoted = toPublicQuote(withInvoice, {
      id: "cust-1",
      email: "c@example.test",
      role: "customer",
    });
    assert.equal(quoted.invoiceNumber, undefined);

    const afterPo = toPublicQuote(
      { ...withInvoice, status: "po_received" },
      {
        id: "cust-1",
        email: "c@example.test",
        role: "customer",
      },
    );
    assert.equal(afterPo.invoiceNumber, "INV-1042");
  });

  it("exposes a paused assistant flag on the public quote", () => {
    const paused = toPublicQuote(
      { ...record, assistantPaused: true, assistantEscalatedAt: "2026-01-02T00:00:00.000Z" },
      {
        id: "staff-1",
        email: "staff@spares.local",
        role: "staff",
      },
    );
    assert.equal(paused.assistantPaused, true);
    assert.equal(paused.assistantEscalatedAt, "2026-01-02T00:00:00.000Z");
    const open = toPublicQuote(record, {
      id: "staff-1",
      email: "staff@spares.local",
      role: "staff",
    });
    assert.equal(open.assistantPaused, undefined);
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

describe("findQuoteInList", () => {
  it("resolves a numeric id only inside the list it is given", () => {
    const host = {
      id: "quote-host",
      number: 1,
      tenantId: "tenant-oee360-host",
    } as QuoteRecord;
    const satellite = {
      id: "quote-sat",
      number: 1,
      tenantId: "tenant-sat",
    } as QuoteRecord;
    assert.equal(findQuoteInList([host, satellite], "1")?.id, "quote-host");
    assert.equal(findQuoteInList([satellite], "1")?.id, "quote-sat");
    assert.equal(findQuoteInList([satellite], "quote-host"), null);
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
