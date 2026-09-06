import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { passwordIssue } from "./password.ts";

describe("passwordIssue", () => {
  it("rejects short passwords", () => {
    assert.equal(passwordIssue("short"), "Use at least 10 characters");
    assert.equal(passwordIssue("SparesStaff1!"), null);
  });
});
