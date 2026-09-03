import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowRateLimit, clientIp, resetRateLimit } from "./rate-limit.ts";

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
