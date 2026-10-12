import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  workListAllHref,
  workListAllLabel,
  workListHubHref,
  workListMachineHref,
  workListTitle,
} from "./work-list-scope.ts";

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

describe("workListTitle", () => {
  it("names the hub list as all items", () => {
    assert.equal(workListTitle("quotes"), "All quotes");
    assert.equal(workListTitle("tickets"), "All tickets");
  });

  it("puts the machine name in the scoped title", () => {
    assert.equal(workListTitle("quotes", "Palletizer"), "Palletizer · Quotes");
    assert.equal(workListTitle("tickets", "Palletizer"), "Palletizer · Tickets");
  });

  it("treats blank machine names as the hub title", () => {
    assert.equal(workListTitle("quotes", "  "), "All quotes");
  });

  it("uses the bare noun while a scoped name is loading", () => {
    assert.equal(workListTitle("quotes", null, true), "Quotes");
    assert.equal(workListTitle("tickets", undefined, true), "Tickets");
  });
});

describe("workListHubHref", () => {
  it("adds a machine filter query on hub lists", () => {
    assert.equal(
      workListHubHref("tickets", "staff", "palletizer"),
      "/care/tickets?machine=palletizer",
    );
    assert.equal(workListHubHref("quotes", "staff"), "/staff/quotes");
  });
});

describe("workListAllLabel", () => {
  it("matches the hub title for the back link", () => {
    assert.equal(workListAllLabel("quotes"), "All quotes");
    assert.equal(workListAllLabel("tickets"), "All tickets");
  });
});
