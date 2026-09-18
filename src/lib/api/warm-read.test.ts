import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invalidateWarmRead, readIfWarm, warmRead } from "./warm-read";

describe("warm-read", () => {
  it("reuses a warmed promise within TTL", async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve("ok");
    };
    warmRead("demo", load);
    await readIfWarm("demo", load);
    await readIfWarm("demo", load);
    assert.equal(calls, 1);
  });

  it("invalidates a warmed key", async () => {
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve("x");
    };
    warmRead("ticket:1", load);
    await readIfWarm("ticket:1", load);
    invalidateWarmRead("ticket:1");
    await readIfWarm("ticket:1", load);
    assert.equal(calls, 2);
  });
});
