import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createQuote,
  resetStoreMemoryForTests,
  writeCatalogHealForTests,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const T = DEFAULT_TENANT_ID;

describe("catalog heal vs concurrent create", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("does not drop a quote that was created after the heal snapshot was taken", async () => {
    process.env.SPARES_ALLOW_SEED = "false";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();

    const staleHealSnapshot = JSON.parse(
      (await persistence.readDatabaseJson()) ??
        JSON.stringify({
          users: [],
          machines: [
            {
              id: "palletizer",
              tenantId: T,
              name: "Palletizer",
              storedFileName: "palletizer.glb",
              parts: [],
            },
          ],
          quotes: [],
          bugReports: [],
          accessInquiries: [],
        }),
    );

    await persistence.writeDatabaseJson(JSON.stringify(staleHealSnapshot));
    resetStoreMemoryForTests();

    const customerId = "cust-demo";
    const created = await createQuote(T, {
      machineId: "palletizer",
      items: [{ partNumber: "PN-1", description: "Test", qty: 1 }],
      customerId,
      customerEmail: "user@demo.com",
    });
    assert.ok(!("error" in created));
    const quoteId = created.id;

    resetStoreMemoryForTests();
    await writeCatalogHealForTests(staleHealSnapshot as never);

    resetStoreMemoryForTests();
    const raw = JSON.parse((await persistence.readDatabaseJson()) ?? "{}") as {
      quotes: Array<{ id: string }>;
    };
    assert.equal(
      raw.quotes.some((quote) => quote.id === quoteId),
      true,
      "stale catalog heal must not erase a quote created on the blob",
    );
  });

  it("does not drop a quote when heal runs with an in-memory snapshot missing a newer quote", async () => {
    process.env.SPARES_ALLOW_SEED = "false";
    const persistence = createMemoryPersistence();
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();

    const base = {
      users: [
        {
          id: "buyer",
          email: "user@demo.com",
          passwordHash: "x",
          role: "customer",
          tenantId: T,
          machineIds: ["palletizer"],
        },
      ],
      machines: [
        {
          id: "palletizer",
          tenantId: T,
          name: "Palletizer",
          storedFileName: "palletizer.glb",
          parts: [],
        },
      ],
      quotes: [] as unknown[],
      bugReports: [],
      accessInquiries: [],
    };
    await persistence.writeDatabaseJson(JSON.stringify(base));

    const staleHeal = JSON.parse((await persistence.readDatabaseJson()) ?? "{}");
    const newQuoteId = randomUUID();
    const newerQuote = {
      id: newQuoteId,
      number: 15,
      machineId: "palletizer",
      items: [],
      createdAt: new Date().toISOString(),
      customerEmail: "user@demo.com",
      customerId: "buyer",
      tenantId: T,
      status: "requested",
      shipments: [],
      activities: [],
      lastReadAt: {},
    };
    await persistence.writeDatabaseJson(
      JSON.stringify({ ...base, quotes: [newerQuote] }),
    );

    resetStoreMemoryForTests();
    await writeCatalogHealForTests(staleHeal as never);

    const raw = JSON.parse((await persistence.readDatabaseJson()) ?? "{}") as {
      quotes: Array<{ id: string }>;
    };
    assert.equal(raw.quotes.some((quote) => quote.id === newQuoteId), true);
  });
});
