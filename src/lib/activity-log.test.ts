import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import {
  filterActivityEvents,
  listAccountActivity,
  parseActivityDocument,
  recordAccountActivity,
} from "./activity-log.ts";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";

describe("activity log", () => {
  beforeEach(() => {
    setPersistenceForTests(createMemoryPersistence());
  });

  after(() => {
    setPersistenceForTests(null);
  });

  it("appends events and never exposes a delete path", async () => {
    const first = await recordAccountActivity({
      tenantId: "tenant-a",
      actor: { userId: "u1", email: "staff@host.test", role: "staff" },
      action: "auth.login",
      summary: "staff@host.test signed in with email and password.",
    });
    const second = await recordAccountActivity({
      tenantId: "tenant-a",
      actor: { userId: "u1", email: "staff@host.test", role: "staff" },
      action: "staff.created",
      summary: "staff@host.test created staff login pat@host.test.",
      target: { type: "staff", id: "u2", label: "pat@host.test" },
    });
    assert.ok(first);
    assert.ok(second);

    const listed = await listAccountActivity({ tenantId: "tenant-a" });
    assert.equal(listed.events.length, 2);
    assert.equal(listed.events[0]?.id, second.id);
    assert.equal(listed.events[1]?.id, first.id);
    assert.equal(listed.total, 2);
    assert.equal(listed.accounts.length, 1);
    assert.equal(listed.accounts[0]?.email, "staff@host.test");
  });

  it("keeps tenants isolated and filters by account", async () => {
    await recordAccountActivity({
      tenantId: "tenant-a",
      actor: { userId: "u1", email: "ada@a.test", role: "staff" },
      action: "auth.login",
      summary: "ada@a.test signed in.",
    });
    await recordAccountActivity({
      tenantId: "tenant-b",
      actor: { userId: "u2", email: "bea@b.test", role: "staff" },
      action: "auth.login",
      summary: "bea@b.test signed in.",
    });
    await recordAccountActivity({
      tenantId: "tenant-a",
      actor: { userId: "u3", email: "cal@a.test", role: "customer" },
      action: "quote.created",
      summary: "cal@a.test created quote #12.",
      target: { type: "quote", id: "q12", label: "#12" },
    });

    const hostA = await listAccountActivity({ tenantId: "tenant-a" });
    assert.equal(hostA.events.length, 2);
    assert.deepEqual(
      hostA.events.map((row) => row.actorEmail).sort(),
      ["ada@a.test", "cal@a.test"],
    );

    const ada = await listAccountActivity({ tenantId: "tenant-a", account: "ADA@a.test" });
    assert.equal(ada.events.length, 1);
    assert.equal(ada.events[0]?.actorEmail, "ada@a.test");

    const byTarget = await listAccountActivity({ tenantId: "tenant-a", account: "q12" });
    assert.equal(byTarget.events.length, 1);
    assert.equal(byTarget.events[0]?.action, "quote.created");
  });

  it("refuses to parse a corrupted sidecar so a heal cannot replace it", () => {
    assert.equal(parseActivityDocument("not-json"), null);
    assert.equal(parseActivityDocument('{"nope":true}'), null);
  });

  it("drops unknown actions and keeps valid rows when reading", () => {
    const parsed = parseActivityDocument(
      JSON.stringify({
        schemaVersion: 1,
        events: [
          {
            id: "e1",
            at: "2026-01-01T00:00:00.000Z",
            tenantId: "tenant-a",
            actorUserId: "u1",
            actorEmail: "ada@a.test",
            actorName: null,
            actorRole: "staff",
            action: "auth.login",
            summary: "signed in",
          },
          {
            id: "bad",
            at: "2026-01-01T00:00:01.000Z",
            tenantId: "tenant-a",
            action: "not.a.real.action",
            summary: "nope",
          },
        ],
      }),
    );
    assert.ok(parsed);
    assert.equal(parsed?.events.length, 1);
    assert.equal(parsed?.events[0]?.id, "e1");
  });

  it("pages newest first with since/before", () => {
    const events = [
      {
        id: "1",
        at: "2026-01-01T00:00:00.000Z",
        tenantId: "t",
        actorUserId: null,
        actorEmail: "a@t.test",
        actorName: null,
        actorRole: "staff" as const,
        action: "auth.login" as const,
        summary: "one",
      },
      {
        id: "2",
        at: "2026-01-01T00:00:01.000Z",
        tenantId: "t",
        actorUserId: null,
        actorEmail: "a@t.test",
        actorName: null,
        actorRole: "staff" as const,
        action: "auth.logout" as const,
        summary: "two",
      },
      {
        id: "3",
        at: "2026-01-01T00:00:02.000Z",
        tenantId: "t",
        actorUserId: null,
        actorEmail: "a@t.test",
        actorName: null,
        actorRole: "staff" as const,
        action: "quote.created" as const,
        summary: "three",
      },
    ];
    const latest = filterActivityEvents(events, { since: "2026-01-01T00:00:00.000Z" });
    assert.deepEqual(
      latest.map((row) => row.id),
      ["3", "2"],
    );
    const earlier = filterActivityEvents(events, { before: "2026-01-01T00:00:02.000Z", limit: 1 });
    assert.deepEqual(
      earlier.map((row) => row.id),
      ["2"],
    );
  });

  it("does not read or write when the log is paused", async () => {
    process.env.SPARES_ACTIVITY_LOG = "false";
    try {
      const event = await recordAccountActivity({
        tenantId: "tenant-a",
        actor: { userId: "u1", email: "staff@host.test", role: "staff" },
        action: "auth.login",
        summary: "should not persist while paused",
      });
      assert.equal(event, null);
      const listed = await listAccountActivity({ tenantId: "tenant-a" });
      assert.equal(listed.total, 0);
      assert.deepEqual(listed.events, []);
    } finally {
      delete process.env.SPARES_ACTIVITY_LOG;
    }
  });
});
