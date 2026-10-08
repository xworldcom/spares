import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { recordAccountActivity, listAccountActivity } from "./activity-log.ts";
import {
  blobActivityPath,
  blobCarePath,
  blobDbPath,
  blobPlatformSettingsPath,
} from "./blob-paths.ts";
import {
  CatalogWriteConflictError,
  catalogConflictResponse,
  withCatalogConflict,
} from "./catalog-conflict.ts";
import { createFakeVercelBlob } from "./fake-vercel-blob.ts";
import { createBlobPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  readPersistedPlatformSettings,
  writePersistedPlatformSettings,
} from "./platform-settings-persistence.ts";
import { createQuote, createTicket, resetStoreMemoryForTests } from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const T = DEFAULT_TENANT_ID;
const envKeys = ["SPARES_ALLOW_SEED", "SPARES_DATA_DIR", "VERCEL", "SPARES_ACTIVITY_LOG"] as const;
const previous: Record<string, string | undefined> = {};
for (const key of envKeys) {
  previous[key] = process.env[key];
}

function catalog() {
  return {
    schemaVersion: 3,
    tenants: [
      { id: T, name: "OEE360 Host", slug: "oee360-host", createdAt: "2020-01-01T00:00:00.000Z" },
    ],
    customers: [],
    sites: [],
    users: [],
    machines: [
      {
        id: "line-1",
        name: "Line 1",
        storedFileName: "line-1.glb",
        originalFileName: "line-1.glb",
        parts: [],
        unmatched: [],
        createdAt: "2020-01-01T00:00:00.000Z",
        tenantId: T,
        version: 1,
      },
    ],
    quotes: [] as Array<Record<string, unknown>>,
    bugReports: [],
    accessInquiries: [],
    machineViews: [],
    manuals: [],
    tickets: [] as Array<Record<string, unknown>>,
    machineUsage: [],
    partLifecycle: [],
  };
}

const customer = { customerId: "c", customerEmail: "c@example.com" };

async function start(hooks: Parameters<typeof createFakeVercelBlob>[0] = {}) {
  process.env.SPARES_ALLOW_SEED = "false";
  process.env.SPARES_ACTIVITY_LOG = "true";
  delete process.env.SPARES_DATA_DIR;
  delete process.env.VERCEL;
  const blob = createFakeVercelBlob({ edgeEtag: "weak", ...hooks });
  setPersistenceForTests(createBlobPersistence(blob.client));
  await blob.externalPut(blobDbPath(), JSON.stringify(catalog(), null, 2));
  resetStoreMemoryForTests();
  return blob;
}

describe("residual documents use compare-and-swap against Blob", () => {
  beforeEach(() => {
    resetStoreMemoryForTests();
  });

  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    for (const key of envKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it("platform settings keep a concurrent writer's field", async () => {
    let raced = true;
    const blob = await start({
      async beforePut(pathname) {
        if (raced || pathname !== blobPlatformSettingsPath()) {
          return;
        }
        raced = true;
        const current = JSON.parse(blob.body(pathname)!) as Record<string, unknown>;
        await blob.externalPut(
          pathname,
          JSON.stringify({ ...current, assistantModel: "other-instance-model" }),
        );
      },
    });
    await writePersistedPlatformSettings({ assistantEnabled: true });
    raced = false;
    await writePersistedPlatformSettings({ passwordLoginEnabled: false });

    const stored = await readPersistedPlatformSettings();
    assert.equal(stored?.passwordLoginEnabled, false);
    assert.equal(stored?.assistantEnabled, true);
    assert.equal(stored?.assistantModel, "other-instance-model");
    assert.ok(blob.calls.precondition412 >= 1, "the race produced a real 412");
  });

  it("activity events appended by two instances are both kept", async () => {
    let raced = true;
    const blob = await start({
      async beforePut(pathname) {
        if (raced || pathname !== blobActivityPath()) {
          return;
        }
        raced = true;
        const current = JSON.parse(blob.body(pathname)!) as { events: unknown[] };
        current.events.push({
          id: "other-instance",
          at: "2030-01-01T00:00:00.000Z",
          tenantId: T,
          action: "auth.login",
          summary: "Other instance login",
        });
        await blob.externalPut(pathname, JSON.stringify(current));
      },
    });
    const actor = { userId: "u", email: "u@example.com", name: null, role: "staff" as const };
    await recordAccountActivity({ tenantId: T, actor, action: "auth.login", summary: "first" });
    raced = false;
    await recordAccountActivity({ tenantId: T, actor, action: "auth.login", summary: "mine" });

    const { events } = await listAccountActivity({ tenantId: T });
    const summaries = events.map((event) => event.summary).sort();
    assert.deepEqual(summaries, ["Other instance login", "first", "mine"]);
    assert.ok(blob.calls.precondition412 >= 1);
  });

  it("a quote number taken by another instance meanwhile is replaced, not duplicated", async () => {
    let armed = false;
    const blob = await start({
      async beforePut(pathname) {
        if (!armed || pathname !== blobDbPath()) {
          return;
        }
        armed = false;
        const current = JSON.parse(blob.body(pathname)!) as ReturnType<typeof catalog>;
        current.quotes.push({
          id: "other-quote",
          number: 1,
          tenantId: T,
          machineId: "line-1",
          machineName: "Line 1",
          items: [],
          status: "submitted",
          createdAt: "2030-01-01T00:00:00.000Z",
          ...customer,
        });
        await blob.externalPut(pathname, JSON.stringify(current, null, 2));
      },
    });
    armed = true;
    const created = await createQuote(T, {
      machineId: "line-1",
      items: [{ id: "P-1", qty: 1 }],
      ...customer,
    });
    assert.ok(!("error" in created));
    assert.equal(created.number, 2, "the returned quote carries the committed number");

    const db = JSON.parse(blob.body(blobDbPath())!) as ReturnType<typeof catalog>;
    const numbers = db.quotes.map((row) => row.number).sort();
    assert.deepEqual(numbers, [1, 2]);
    assert.equal(db.quotes.find((row) => row.id === created.id)?.number, 2);
  });

  it("a ticket number taken by another instance meanwhile is replaced, not duplicated", async () => {
    let armed = false;
    const blob = await start({
      async beforePut(pathname) {
        if (!armed || pathname !== blobCarePath()) {
          return;
        }
        armed = false;
        const current = JSON.parse(blob.body(pathname) ?? "{}") as { tickets?: unknown[] };
        await blob.externalPut(
          pathname,
          JSON.stringify({
            ...current,
            tickets: [
              ...(current.tickets ?? []),
              {
                id: "other-ticket",
                number: 1,
                tenantId: T,
                machineId: "line-1",
                title: "Other",
                status: "open",
                createdAt: "2030-01-01T00:00:00.000Z",
                updatedAt: "2030-01-01T00:00:00.000Z",
                activities: [],
                ...customer,
              },
            ],
          }),
        );
      },
    });
    armed = true;
    const created = await createTicket(T, {
      machineId: "line-1",
      title: "Mine",
      ...customer,
      actor: { email: "c@example.com", role: "customer", id: "c" },
    });
    assert.ok("ticket" in created && created.ticket);
    assert.equal(created.ticket.number, 2);
    const care = JSON.parse(blob.body(blobCarePath())!) as {
      tickets: Array<{ id: string; number: number }>;
    };
    assert.deepEqual(care.tickets.map((row) => row.number).sort(), [1, 2]);
  });
});

describe("409 wrapper for mutating routes", () => {
  it("turns a catalog write conflict into a retryable 409", async () => {
    const handler = withCatalogConflict(async () => {
      throw new CatalogWriteConflictError();
    });
    const response = await handler();
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("Retry-After"), "1");
    const body = (await response.json()) as { code: string; error: string };
    assert.equal(body.code, "catalog-conflict");
    assert.match(body.error, /try again/i);
    assert.equal((await catalogConflictResponse().json()).code, "catalog-conflict");
  });

  it("passes other errors and normal responses through", async () => {
    const ok = withCatalogConflict(async () => new Response("fine", { status: 201 }));
    assert.equal((await ok()).status, 201);
    const boom = withCatalogConflict(async () => {
      throw new Error("boom");
    });
    await assert.rejects(() => boom(), /boom/);
  });
});
