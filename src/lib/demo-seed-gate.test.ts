import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  isBuiltinDemoSeedEmail,
  isDemoSeedLoginBlocked,
  isProtectedDemoSeedLogin,
} from "./demo-seed-gate.ts";

describe("demo seed login gate", () => {
  const envKeys = ["VERCEL", "SPARES_ALLOW_SEED"] as const;
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it("recognizes built-in preview seed emails", () => {
    assert.equal(isBuiltinDemoSeedEmail("staff@spares.local"), true);
    assert.equal(isBuiltinDemoSeedEmail("  Customer@spares.local "), true);
    assert.equal(isBuiltinDemoSeedEmail("kevin@example.com"), false);
  });

  it("blocks demo seeds on Vercel Production (no SPARES_ALLOW_SEED)", () => {
    process.env.VERCEL = "1";
    delete process.env.SPARES_ALLOW_SEED;
    assert.equal(isDemoSeedLoginBlocked("staff@spares.local"), true);
    assert.equal(isDemoSeedLoginBlocked("kevin@example.com"), false);
  });

  it("allows demo seeds on Vercel Preview when SPARES_ALLOW_SEED is set", () => {
    process.env.VERCEL = "1";
    process.env.SPARES_ALLOW_SEED = "true";
    assert.equal(isDemoSeedLoginBlocked("customer@spares.local"), false);
  });

  it("allows demo seeds off Vercel for local dev", () => {
    delete process.env.VERCEL;
    delete process.env.SPARES_ALLOW_SEED;
    assert.equal(isDemoSeedLoginBlocked("staff@spares.local"), false);
  });

  it("protects the two documented demo logins only while seeds are on", () => {
    process.env.VERCEL = "1";
    process.env.SPARES_ALLOW_SEED = "true";
    assert.equal(isProtectedDemoSeedLogin("staff@spares.local"), true);
    assert.equal(isProtectedDemoSeedLogin(" Customer@spares.local "), true);
    // Extra QA customers and every real login stay deletable.
    assert.equal(isProtectedDemoSeedLogin("buyer@acme.test"), false);
    assert.equal(isProtectedDemoSeedLogin("ops@jmp-solutions.test"), false);

    process.env.SPARES_ALLOW_SEED = "false";
    assert.equal(isProtectedDemoSeedLogin("staff@spares.local"), false);
  });
});
