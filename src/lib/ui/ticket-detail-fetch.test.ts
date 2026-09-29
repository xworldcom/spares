import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("TicketDetail fetch loop guards", () => {
  it("does not re-fetch when the ticket list row patches read state", () => {
    const src = readFileSync(
      new URL("../../components/care/TicketDetail.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /lastTicketIdRef/);
    const fetchEffect = src.match(
      /getTicket\(ticketId\)[\s\S]*?refreshCareAlerts\(\);/,
    )?.[0];
    assert.ok(fetchEffect);
    assert.doesNotMatch(fetchEffect, /onTicketListPatch/);
    assert.doesNotMatch(src, /\[ticketId, reloadKey, refreshCareAlerts, seedTicket/);
  });

  it("keeps list patches referentially stable when read fields are unchanged", () => {
    const src = readFileSync(
      new URL("../../components/care/TicketsWorkspace.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /return changed \? next : rows/);
  });
});
