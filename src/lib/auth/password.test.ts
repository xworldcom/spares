import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIN_PASSWORD_LENGTH, passwordPolicyError } from "./password.ts";

describe("passwordPolicyError", () => {
  it("rejects short passwords", () => {
    assert.equal(
      passwordPolicyError("short"),
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
    assert.equal(passwordPolicyError("a".repeat(MIN_PASSWORD_LENGTH)), null);
  });
});
