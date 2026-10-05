import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOGIN_EMAIL_RATE_LIMIT,
  allowRateLimit,
  clientIp,
  isLoginAttemptAllowed,
  recordFailedLoginAttempt,
  resetRateLimit,
} from "./rate-limit.ts";

describe("allowRateLimit", () => {
  it("allows up to the limit then blocks within the window", () => {
    resetRateLimit();
    const start = 1_000_000;
    assert.equal(allowRateLimit("ip-a", 5, 60_000, start), true);
    assert.equal(allowRateLimit("ip-a", 5, 60_000, start + 1), true);
    assert.equal(allowRateLimit("ip-a", 5, 60_000, start + 2), true);
    assert.equal(allowRateLimit("ip-a", 5, 60_000, start + 3), true);
    assert.equal(allowRateLimit("ip-a", 5, 60_000, start + 4), true);
    assert.equal(allowRateLimit("ip-a", 5, 60_000, start + 5), false);
    assert.equal(allowRateLimit("ip-b", 5, 60_000, start + 5), true);
    assert.equal(allowRateLimit("ip-a", 5, 60_000, start + 60_000), true);
  });
});

describe("login rate limits", () => {
  const requestSameIp = new Request("http://localhost/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.20" },
  });
  const requestOtherIp = new Request("http://localhost/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.21" },
  });

  it("blocks a repeated email after enough failed attempts", () => {
    resetRateLimit();
    for (let i = 0; i < LOGIN_EMAIL_RATE_LIMIT; i += 1) {
      assert.equal(isLoginAttemptAllowed(requestSameIp, "staff@spares.local"), true);
      recordFailedLoginAttempt(requestSameIp, "staff@spares.local");
    }
    assert.equal(isLoginAttemptAllowed(requestSameIp, "staff@spares.local"), false);
    assert.equal(isLoginAttemptAllowed(requestOtherIp, "customer@spares.local"), true);
  });

  it("does not block another email on the same IP after many failures on the first", () => {
    resetRateLimit();
    for (let i = 0; i < LOGIN_EMAIL_RATE_LIMIT; i += 1) {
      recordFailedLoginAttempt(requestSameIp, "staff@spares.local");
    }
    assert.equal(isLoginAttemptAllowed(requestSameIp, "staff@spares.local"), false);
    assert.equal(isLoginAttemptAllowed(requestSameIp, "user@demo.com"), true);
  });

  it("allows many allowance checks without recording failures (successful sign-in path)", () => {
    resetRateLimit();
    for (let i = 0; i < LOGIN_EMAIL_RATE_LIMIT + 5; i += 1) {
      assert.equal(isLoginAttemptAllowed(requestSameIp, "user@demo.com"), true);
    }
    assert.equal(isLoginAttemptAllowed(requestSameIp, "user@demo.com"), true);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for hop", () => {
    const request = new Request("http://localhost/api/bugs", {
      headers: {
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        "x-real-ip": "10.0.0.1",
      },
    });
    assert.equal(clientIp(request), "203.0.113.9");
  });
});
