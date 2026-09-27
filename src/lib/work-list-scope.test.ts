import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { workListAllHref, workListMachineHref } from "./work-list-scope.ts";

describe("workListAllHref", () => {
  it("routes tickets to the Care hub list", () => {
    assert.equal(workListAllHref("tickets"), "/care/tickets");
  });

  it("routes customer quotes to the global quotes page", () => {
    assert.equal(workListAllHref("quotes", "customer"), "/quotes");
  });

  it("routes staff quotes to the staff console", () => {
    assert.equal(workListAllHref("quotes", "staff"), "/staff/quotes");
  });
});

describe("workListMachineHref", () => {
  it("routes tickets to machine care tickets", () => {
    assert.equal(workListMachineHref("tickets", "m1"), "/machines/m1/care/tickets");
  });

  it("routes quotes to machine quotes", () => {
    assert.equal(workListMachineHref("quotes", "m1"), "/machines/m1/quotes");
  });
});
