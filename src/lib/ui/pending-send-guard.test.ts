import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leavesCurrentPage } from "./pending-send-guard.ts";

const here = { href: "https://oee360.com/quotes/12", origin: "https://oee360.com" };

describe("leavesCurrentPage", () => {
  it("flags in-app links to another page", () => {
    assert.equal(leavesCurrentPage({ href: "/machines" }, here), true);
    assert.equal(leavesCurrentPage({ href: "/quotes/12?tab=x" }, here), true);
  });
  it("ignores same-page, hash, external, and new-tab links", () => {
    assert.equal(leavesCurrentPage({ href: "/quotes/12#bottom" }, here), false);
    assert.equal(leavesCurrentPage({ href: "https://example.com/x" }, here), false);
    assert.equal(leavesCurrentPage({ href: "/machines", target: "_blank" }, here), false);
  });
});
