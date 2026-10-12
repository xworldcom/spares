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
    ...(partial.lastModifiedAt ? { lastModifiedAt: partial.lastModifiedAt } : {}),
  };
}

describe("ticketMatchesCareSearch", () => {
  it("matches title and number", () => {
    const row = ticket({ id: "t1", number: 42, title: "Belt slip" });
    assert.equal(ticketMatchesCareSearch(row, "belt"), true);
    assert.equal(ticketMatchesCareSearch(row, "42"), true);
    assert.equal(ticketMatchesCareSearch(row, "nope"), false);
  });

  it("matches ticket number exactly for numeric-only query", () => {
    const nine = ticket({ id: "t9", number: 9, title: "Fault" });
    const twentyNine = ticket({ id: "t29", number: 29, title: "Fault" });
    assert.equal(ticketMatchesCareSearch(nine, "9"), true);
    assert.equal(ticketMatchesCareSearch(twentyNine, "9"), false);
  });

  it("matches ticket number with T prefix", () => {
    const row = ticket({ id: "t9", number: 9, title: "Infeed fault" });
    assert.equal(ticketMatchesCareSearch(row, "T9"), true);
    assert.equal(ticketMatchesCareSearch(row, "ticket 9"), true);
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

  it("sorts by lastModifiedAt when sort is updated", () => {
    const rows = [
      ticket({
        id: "old",
        number: 8,
        createdAt: "2026-10-01T00:00:00.000Z",
        lastModifiedAt: "2026-10-02T00:00:00.000Z",
      }),
      ticket({
        id: "nine",
        number: 9,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastModifiedAt: "2026-10-12T00:00:00.000Z",
      }),
    ];
    const sorted = filterAndSortCareTickets(rows, {
      query: "",
      status: "all",
      sort: "updated",
    });
    assert.deepEqual(sorted.map((row) => row.number), [9, 8]);
  });

  it("ranks exact ticket number first for numeric search", () => {
    const rows = [
      ticket({ id: "t29", number: 29, title: "Line 29 fault" }),
      ticket({ id: "t9", number: 9, title: "Line 9 fault" }),
      ticket({ id: "t19", number: 19, title: "Line 19 fault" }),
    ];
    const sorted = filterAndSortCareTickets(rows, {
      query: "9",
      status: "all",
      sort: "recent",
    });
    assert.equal(sorted[0]?.number, 9);
    const sortedT9 = filterAndSortCareTickets(rows, {
      query: "T9",
      status: "all",
      sort: "recent",
    });
    assert.equal(sortedT9[0]?.number, 9);
  });
});
