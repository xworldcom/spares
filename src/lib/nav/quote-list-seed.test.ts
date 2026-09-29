import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quoteSeedForRef, rememberQuoteForNav } from "./quote-list-seed.ts";
import type { Quote } from "@/types";

function sampleQuote(number: number): Quote {
  return {
    id: `q-${number}`,
    number,
    status: "requested",
    machineId: "m1",
    machineName: "Cell",
    customerEmail: "plant@example.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    items: [],
    activities: [],
    shipments: [],
    unread: false,
  };
}

describe("rememberQuoteForNav", () => {
  it("seeds quote detail by id and number", () => {
    const quote = sampleQuote(4418);
    rememberQuoteForNav(quote);
    assert.equal(quoteSeedForRef(quote.id)?.number, 4418);
    assert.equal(quoteSeedForRef(String(quote.number))?.id, quote.id);
  });
});
