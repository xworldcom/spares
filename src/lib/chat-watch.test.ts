import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  bumpChatWatch,
  chatWatchChannel,
  chatWatchFileName,
  chatWatchWaiterCountForTests,
  conversationWatchChanged,
  customerReadWatchChanged,
  readChatWatch,
  resetChatWatchForTests,
  waitForChatWatch,
} from "./chat-watch.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";

describe("chat watch doorbell", () => {
  afterEach(() => {
    resetChatWatchForTests();
    setPersistenceForTests(null);
  });

  it("returns the current revision immediately for a first listen", async () => {
    setPersistenceForTests(createMemoryPersistence());
    const channel = chatWatchChannel("ticket", "t1");
    const rev = await bumpChatWatch(channel);
    const waited = await waitForChatWatch(channel, 0, { maxMs: 50 });
    assert.equal(waited, rev);
  });

  it("waits from revision zero until the first post", async () => {
    setPersistenceForTests(createMemoryPersistence());
    const channel = chatWatchChannel("ticket", "t0");
    const pending = waitForChatWatch(channel, 0, { maxMs: 2_000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const rev = await bumpChatWatch(channel);
    assert.equal(await pending, rev);
    assert.ok(rev > 0);
  });

  it("wakes a waiter when the same process posts", async () => {
    setPersistenceForTests(createMemoryPersistence());
    const channel = chatWatchChannel("quote", "q1");
    const since = await bumpChatWatch(channel);
    const pending = waitForChatWatch(channel, since, { maxMs: 2_000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const rev = await bumpChatWatch(channel);
    assert.equal(await pending, rev);
    assert.ok(rev > since);
  });

  it("sees a revision written by another process via that thread's watch file", async () => {
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    const channel = chatWatchChannel("ticket", "t2");
    const since = await readChatWatch(channel);
    resetChatWatchForTests();
    setPersistenceForTests(persistence);
    await persistence.writeFileBytes(
      chatWatchFileName(channel),
      Buffer.from(JSON.stringify({ rev: since + 9 })),
    );
    const waited = await waitForChatWatch(channel, since, { maxMs: 1_500 });
    assert.equal(waited, since + 9);
  });

  it("does not let one thread clobber another thread's doorbell", async () => {
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    const ticket = chatWatchChannel("ticket", "t-keep");
    const quote = chatWatchChannel("quote", "q-other");
    const ticketRev = await bumpChatWatch(ticket);
    resetChatWatchForTests();
    setPersistenceForTests(persistence);
    const quoteRev = await bumpChatWatch(quote);
    assert.equal(await readChatWatch(ticket), ticketRev);
    assert.equal(await readChatWatch(quote), quoteRev);
  });

  it("drops a waiter when the hold is aborted", async () => {
    setPersistenceForTests(createMemoryPersistence());
    const channel = chatWatchChannel("ticket", "t-abort");
    const controller = new AbortController();
    const pending = waitForChatWatch(channel, 0, { maxMs: 5_000, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(chatWatchWaiterCountForTests(channel), 1);
    controller.abort();
    await pending;
    assert.equal(chatWatchWaiterCountForTests(channel), 0);
  });

  it("ignores read-only receipt changes on the activity doorbell", () => {
    assert.equal(
      conversationWatchChanged(
        { status: "open", activities: [{ id: "a" }] },
        { status: "open", activities: [{ id: "a" }] },
      ),
      false,
    );
    assert.equal(
      conversationWatchChanged(
        { status: "open", activities: [{ id: "a" }] },
        { status: "closed", activities: [{ id: "a" }, { id: "b" }] },
      ),
      true,
    );
  });

  it("detects customer read watermark changes without staff marks", () => {
    assert.equal(
      customerReadWatchChanged(
        { "staff-1": "2026-01-01T00:00:00.000Z" },
        { "staff-1": "2026-01-02T00:00:00.000Z" },
        ["cust-1"],
      ),
      false,
    );
    assert.equal(
      customerReadWatchChanged(
        { "cust-1": "2026-01-01T00:00:00.000Z" },
        { "cust-1": "2026-01-02T00:00:00.000Z" },
        ["cust-1"],
      ),
      true,
    );
  });
});
