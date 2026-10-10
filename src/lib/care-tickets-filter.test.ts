import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterAndSortCareTickets,
  ticketMatchesCareSearch,
} from "./care-tickets-filter.ts";
import type { ServiceTicket } from "../types/index.ts";

function ticket(partial: Partial<ServiceTicket> & Pick<ServiceTicket, "id">): ServiceTicket {
  return {
    id: partial.id,
    number: partial.number ?? 1,
    title: partial.title ?? "Test",
    status: partial.status ?? "open",
    machineId: partial.machineId ?? "m1",
    machineName: partial.machineName ?? "Machine",
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    customerEmail: partial.customerEmail ?? "a@example.com",
    activities: partial.activities ?? [],
    unread: partial.unread ?? false,
    viewerReadAt: partial.viewerReadAt,
  };
}

describe("ticketMatchesCareSearch", () => {
  it("matches title and number", () => {
    const row = ticket({ id: "t1", number: 42, title: "Belt slip" });
    assert.equal(ticketMatchesCareSearch(row, "belt"), true);
    assert.equal(ticketMatchesCareSearch(row, "42"), true);
    assert.equal(ticketMatchesCareSearch(row, "nope"), false);
  });
});

describe("filterAndSortCareTickets", () => {
  it("filters open tickets", () => {
    const rows = [
      ticket({ id: "a", status: "open" }),
      ticket({ id: "b", status: "resolved" }),
    ];
    const open = filterAndSortCareTickets(rows, {
      query: "",
      status: "open",
      sort: "recent",
    });
    assert.deepEqual(open.map((row) => row.id), ["a"]);
  });
});
