import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initialsFromEmail, isHumanComment } from "./initials.ts";

describe("initialsFromEmail", () => {
  it("uses the first two letters of a single local-part", () => {
    assert.equal(initialsFromEmail("staff@spares.local"), "ST");
    assert.equal(initialsFromEmail("customer@spares.local"), "CU");
    assert.equal(initialsFromEmail("kevin@huzevka.com"), "KE");
  });

  it("uses first letters of two tokens", () => {
    assert.equal(initialsFromEmail("jane.doe@example.test"), "JD");
    assert.equal(initialsFromEmail("ann-marie@example.test"), "AM");
  });

  it("handles a single character and empty local-part", () => {
    assert.equal(initialsFromEmail("j@example.test"), "J");
    assert.equal(initialsFromEmail("@example.test"), "?");
    assert.equal(initialsFromEmail(""), "?");
  });
});

describe("isHumanComment", () => {
  it("treats typed chatter as human and status/pricing/po/shipment as system", () => {
    assert.equal(isHumanComment({ kind: "message" }), true);
    assert.equal(isHumanComment({ kind: "status" }), false);
    assert.equal(isHumanComment({ kind: "pricing" }), false);
    assert.equal(isHumanComment({ kind: "po" }), false);
    assert.equal(isHumanComment({ kind: "shipment" }), false);
  });
});
