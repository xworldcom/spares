import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  careTicketsListQueryString,
  careTicketsPathWithListQuery,
  hrefWithCareTicketsListQuery,
  mergeHrefWithCareTicketsListQuery,
} from "./care-tickets-list-query.ts";

describe("careTicketsListQueryString", () => {
  it("serializes list filters for ticket detail URLs", () => {
    const params = new URLSearchParams("status=open&sort=updated&q=belt&machine=m1");
    assert.equal(
      careTicketsListQueryString(params),
      "?status=open&sort=updated&q=belt&machine=m1",
    );
    assert.equal(
      hrefWithCareTicketsListQuery("/care/tickets/t1", params),
      "/care/tickets/t1?status=open&sort=updated&q=belt&machine=m1",
    );
  });
});

describe("careTicketsPathWithListQuery", () => {
  it("keeps filters on machine ticket detail when adjusting list state", () => {
    const params = new URLSearchParams("status=open&sort=updated");
    assert.equal(
      careTicketsPathWithListQuery("machine", {
        listHref: "/machines/m1/care/tickets",
        machineId: "m1",
        ticketId: "t1",
        searchParams: params,
      }),
      "/machines/m1/care/tickets/t1?status=open&sort=updated",
    );
  });

  it("uses list href when no ticket is open", () => {
    const params = new URLSearchParams("status=closed");
    assert.equal(
      careTicketsPathWithListQuery("hub", {
        listHref: "/care/tickets",
        searchParams: params,
      }),
      "/care/tickets?status=closed",
    );
  });
});

describe("mergeHrefWithCareTicketsListQuery", () => {
  it("merges machine scope onto hub ticket detail links", () => {
    const params = new URLSearchParams("status=open&sort=updated");
    assert.equal(
      mergeHrefWithCareTicketsListQuery(
        "/care/tickets/t1?machine=m1",
        params,
      ),
      "/care/tickets/t1?machine=m1&status=open&sort=updated",
    );
  });
});
