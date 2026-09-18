import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invalidateWarmRead, readIfWarm, warmRead } from "./warm-read.ts";

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

  it("keeps entity shape when warm helpers call getTicket", async () => {
    let calls = 0;
    const ticket = {
      id: "t1",
      number: 9,
      machineId: "m1",
      title: "Test",
      status: "open" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      customerEmail: "a@b.c",
      activities: [],
      unread: false,
    };
    const getTicket = async (id: string) => {
      calls += 1;
      assert.equal(id, "t1");
      return ticket;
    };
    warmRead("ticket:t1", () => getTicket("t1"));
    const first = await readIfWarm("ticket:t1", () => getTicket("t1"));
    const second = await readIfWarm("ticket:t1", () => getTicket("t1"));
    assert.equal(first.id, "t1");
    assert.equal(second.title, "Test");
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
