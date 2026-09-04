import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signSession, verifySession } from "./session-token.ts";

describe("session cookie payload", () => {
  it("signs email so a remapped user id can still resolve", () => {
    const token = signSession("old-random-uuid", "customer@spares.local");
    const session = verifySession(token);
    assert.ok(session);
    assert.equal(session.userId, "old-random-uuid");
    assert.equal(session.email, "customer@spares.local");
    assert.ok(session.exp > Date.now());
  });

  it("rejects a tampered payload", () => {
    const [payload, signature] = signSession("user-customer", "customer@spares.local").split(".");
    const tampered = Buffer.from(
      JSON.stringify({ userId: "user-staff", email: "staff@spares.local", exp: Date.now() + 1000 }),
    ).toString("base64url");
    assert.equal(verifySession(`${tampered}.${signature}`), null);
    assert.equal(verifySession(`${payload}.not-a-signature`), null);
  });
});
