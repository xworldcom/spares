import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMicrosoftOAuthState,
  decodeMicrosoftOAuthState,
  MICROSOFT_ACCESS_DENIED_MESSAGE,
  pickMicrosoftEmail,
  resolveMicrosoftLogin,
  resolveMicrosoftSession,
} from "./microsoft.ts";

describe("microsoft session tenant resolution", () => {
  it("stamps effective tenant for host staff with create-time pin", () => {
    const result = resolveMicrosoftSession({
      id: "user-1",
      email: "qa-staff-host5-pr128@example.com",
      role: "staff",
      tenantId: "tenant-satellite-drift",
      staffCreatedTenantId: "tenant-oee360-host",
    });
    assert.deepEqual(result, {
      ok: true,
      userId: "user-1",
      email: "qa-staff-host5-pr128@example.com",
      tenantId: "tenant-oee360-host",
    });
  });

  it("stamps satellite tenant for satellite staff", () => {
    const result = resolveMicrosoftSession({
      id: "user-2",
      email: "satellite-staff@test",
      role: "staff",
      tenantId: "tenant-satellite-co",
      staffCreatedTenantId: "tenant-satellite-co",
    });
    assert.deepEqual(result, {
      ok: true,
      userId: "user-2",
      email: "satellite-staff@test",
      tenantId: "tenant-satellite-co",
    });
  });

  it("denies unknown email like password login would", () => {
    assert.deepEqual(resolveMicrosoftSession(null), {
      ok: false,
      message: MICROSOFT_ACCESS_DENIED_MESSAGE,
    });
  });

  it("denies staff missing tenant scope", () => {
    assert.deepEqual(
      resolveMicrosoftSession({
        id: "user-3",
        email: "orphan@test",
        role: "staff",
      }),
      { ok: false, message: MICROSOFT_ACCESS_DENIED_MESSAGE },
    );
  });
});

describe("microsoft login resolution", () => {
  it("accepts an active user matched by email", () => {
    assert.deepEqual(resolveMicrosoftLogin({ deletedAt: null }), { ok: true });
    assert.deepEqual(resolveMicrosoftLogin({}), { ok: true });
  });

  it("rejects missing or deleted users with the admin message", () => {
    assert.deepEqual(resolveMicrosoftLogin(null), {
      ok: false,
      message: MICROSOFT_ACCESS_DENIED_MESSAGE,
    });
    assert.deepEqual(resolveMicrosoftLogin({ deletedAt: "2026-01-01T00:00:00.000Z" }), {
      ok: false,
      message: MICROSOFT_ACCESS_DENIED_MESSAGE,
    });
  });
});

describe("microsoft email from Graph profile", () => {
  it("prefers mail then otherMails then userPrincipalName", () => {
    assert.equal(
      pickMicrosoftEmail({
        mail: "Staff@Example.com",
        userPrincipalName: "staff@example.com",
      }),
      "staff@example.com",
    );
    assert.equal(
      pickMicrosoftEmail({
        mail: null,
        otherMails: ["Person@Contoso.com"],
        userPrincipalName: "person@contoso.com",
      }),
      "person@contoso.com",
    );
    assert.equal(pickMicrosoftEmail({ userPrincipalName: "nope" }), null);
  });
});

describe("microsoft oauth state", () => {
  it("round-trips signed state with allowed origin", () => {
    const token = createMicrosoftOAuthState("http://localhost:3000", "/machines");
    const decoded = decodeMicrosoftOAuthState(token);
    assert.ok(decoded);
    assert.equal(decoded.origin, "http://localhost:3000");
    assert.equal(decoded.next, "/machines");
    assert.ok(decoded.exp > Date.now());
  });

  it("rejects tampered state", () => {
    const token = createMicrosoftOAuthState("http://localhost:3000", "/");
    const [payload] = token.split(".");
    assert.equal(decodeMicrosoftOAuthState(`${payload}.bad-signature`), null);
  });
});
