import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  careTicketsListQueryString,
  hrefWithCareTicketsListQuery,
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
