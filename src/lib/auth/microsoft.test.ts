import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMicrosoftOAuthState,
  decodeMicrosoftOAuthState,
  MICROSOFT_ACCESS_DENIED_MESSAGE,
  microsoftAuthorizeUrl,
  parseMicrosoftIdToken,
  resolveMicrosoftLogin,
  resolveMicrosoftSession,
} from "./microsoft.ts";
import { MICROSOFT_CONSUMER_TID } from "./sso-domain.ts";

const TID = "11111111-2222-4333-8444-555555555555";
const CLIENT_ID = "client-abc";
const NONCE = "nonce-xyz";
const NOW = Date.parse("2026-09-26T12:00:00.000Z");

function b64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeIdToken(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256" }) {
  return `${b64url(header)}.${b64url(payload)}.c2lnbmF0dXJl`;
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    tid: TID,
    oid: "oid-001",
    aud: CLIENT_ID,
    iss: `https://login.microsoftonline.com/${TID}/v2.0`,
    exp: Math.floor(NOW / 1000) + 600,
    nonce: NONCE,
    ...overrides,
  };
}

const expect = { clientId: CLIENT_ID, nonce: NONCE, now: NOW };

describe("parseMicrosoftIdToken", () => {
  it("returns tid, oid, and emails in trust-table order", () => {
    const token = fakeIdToken(
      validPayload({
        preferred_username: " Jane@Shape.com ",
        upn: "jane@shape.com",
        email: "Jane.Alias@Contoso.com",
      }),
    );
    assert.deepEqual(parseMicrosoftIdToken(token, expect), {
      tid: TID,
      oid: "oid-001",
      emails: [
        { email: "jane@shape.com", verified: true },
        { email: "jane.alias@contoso.com", verified: false },
      ],
    });
  });

  it("drops guest #EXT# UPNs and keeps non-email preferred_username out", () => {
    const token = fakeIdToken(
      validPayload({
        preferred_username: "jane_gmail.com#EXT#@shape.onmicrosoft.com",
        upn: "jane_gmail.com#EXT#@shape.onmicrosoft.com",
        email: "jane@gmail.com",
      }),
    );
    assert.deepEqual(parseMicrosoftIdToken(token, expect)?.emails, [
      { email: "jane@gmail.com", verified: false },
    ]);
    const bare = fakeIdToken(validPayload({ preferred_username: "jane", upn: "jane@shape.com" }));
    assert.deepEqual(parseMicrosoftIdToken(bare, expect)?.emails, [
      { email: "jane@shape.com", verified: true },
    ]);
  });

  it("treats email as verified only with xms_edov", () => {
    const edov = fakeIdToken(validPayload({ email: "pat@shape.com", xms_edov: true }));
    assert.deepEqual(parseMicrosoftIdToken(edov, expect)?.emails, [
      { email: "pat@shape.com", verified: true },
    ]);
    const edovString = fakeIdToken(validPayload({ email: "pat@shape.com", xms_edov: "true" }));
    assert.deepEqual(parseMicrosoftIdToken(edovString, expect)?.emails, [
      { email: "pat@shape.com", verified: true },
    ]);
    const plain = fakeIdToken(validPayload({ email: "pat@shape.com" }));
    assert.deepEqual(parseMicrosoftIdToken(plain, expect)?.emails, [
      { email: "pat@shape.com", verified: false },
    ]);
  });

  it("never treats a personal account claim as verified", () => {
    const token = fakeIdToken(
      validPayload({
        tid: MICROSOFT_CONSUMER_TID,
        iss: `https://login.microsoftonline.com/${MICROSOFT_CONSUMER_TID}/v2.0`,
        preferred_username: "victim@shape.com",
        email: "victim@shape.com",
        xms_edov: true,
      }),
    );
    assert.deepEqual(parseMicrosoftIdToken(token, expect), {
      tid: MICROSOFT_CONSUMER_TID,
      oid: "oid-001",
      emails: [{ email: "victim@shape.com", verified: false }],
    });
  });

  it("fails closed on audience, nonce, issuer, expiry, alg, and tid", () => {
    assert.equal(parseMicrosoftIdToken(fakeIdToken(validPayload({ aud: "other" })), expect), null);
    assert.equal(parseMicrosoftIdToken(fakeIdToken(validPayload({ nonce: "other" })), expect), null);
    assert.equal(
      parseMicrosoftIdToken(
        fakeIdToken(validPayload({ iss: "https://login.microsoftonline.com/common/v2.0" })),
        expect,
      ),
      null,
    );
    assert.equal(
      parseMicrosoftIdToken(fakeIdToken(validPayload({ exp: Math.floor(NOW / 1000) - 1 })), expect),
      null,
    );
    assert.equal(parseMicrosoftIdToken(fakeIdToken(validPayload(), { alg: "none" }), expect), null);
    assert.equal(parseMicrosoftIdToken(fakeIdToken(validPayload({ tid: undefined })), expect), null);
    assert.equal(parseMicrosoftIdToken(fakeIdToken(validPayload({ tid: "shape.com" })), expect), null);
    assert.equal(parseMicrosoftIdToken(fakeIdToken(validPayload({ oid: "" })), expect), null);
    assert.equal(parseMicrosoftIdToken("not.a-jwt", expect), null);
    assert.equal(parseMicrosoftIdToken(`${b64url({ alg: "RS256" })}.%%%.sig`, expect), null);
  });
});

describe("microsoftAuthorizeUrl", () => {
  it("requests only OIDC scopes and carries the nonce", () => {
    const url = new URL(
      microsoftAuthorizeUrl(
        { clientId: CLIENT_ID, clientSecret: "s", tenantId: "organizations" },
        "http://localhost:3000/api/auth/microsoft/callback",
        "state-1",
        NONCE,
      ),
    );
    assert.equal(url.origin + url.pathname, "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize");
    assert.equal(url.searchParams.get("scope"), "openid profile email");
    assert.equal(url.searchParams.get("nonce"), NONCE);
    assert.equal(url.searchParams.get("state"), "state-1");
    assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
  });
});

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

describe("microsoft oauth state", () => {
  it("round-trips signed state with allowed origin and exposes the nonce", () => {
    const { state, nonce } = createMicrosoftOAuthState("http://localhost:3000", "/machines");
    const decoded = decodeMicrosoftOAuthState(state);
    assert.ok(decoded);
    assert.equal(decoded.origin, "http://localhost:3000");
    assert.equal(decoded.next, "/machines");
    assert.equal(decoded.nonce, nonce);
    assert.ok(nonce.length >= 16);
    assert.ok(decoded.exp > Date.now());
  });

  it("rejects tampered state", () => {
    const { state } = createMicrosoftOAuthState("http://localhost:3000", "/");
    const [payload] = state.split(".");
    assert.equal(decodeMicrosoftOAuthState(`${payload}.bad-signature`), null);
  });

  it("sanitizes next inside the signed state", () => {
    const { state } = createMicrosoftOAuthState(
      "http://localhost:3000",
      "/\\evil.example.test",
    );
    assert.equal(decodeMicrosoftOAuthState(state)?.next, "/machines");
  });
});
