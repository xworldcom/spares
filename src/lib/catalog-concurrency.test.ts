import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  appendQuoteActivity,
  createQuote,
  getMachine,
  listMachines,
  markQuoteRead,
  mutateQuote,
  resetStoreMemoryForTests,
  seedEmptyMachineCatalogForTests,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const TENANT = DEFAULT_TENANT_ID;

function seedCatalog() {
  setPersistenceForTests(createMemoryPersistence());
  resetStoreMemoryForTests();
  process.env.SPARES_ALLOW_SEED = "1";
  seedEmptyMachineCatalogForTests([
    {
      id: "user-staff",
      email: "staff@demo.com",
      passwordHash: "x",
      role: "staff",
      tenantId: TENANT,
    },
    {
      id: "user-customer",
      email: "user@demo.com",
      passwordHash: "x",
      role: "customer",
      tenantId: TENANT,
      machineIds: [],
    },
  ]);
}

describe("catalog concurrency (CAS + rebase)", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("parallel markQuoteRead and status change both land", async () => {
    seedCatalog();
    const machines = await listMachines(TENANT);
    const machineId = machines[0]?.id;
    assert.ok(machineId);
    const quote = await createQuote(TENANT, {
      machineId,
      customerId: "user-customer",
      items: [{ id: "part-1", qty: 1, name: "Bearing" }],
      note: "concurrency",
    });
    const staff = { id: "user-staff", email: "staff@demo.com", role: "staff" as const };

    await Promise.all([
      markQuoteRead(quote.id, TENANT, staff.id),
      mutateQuote(quote.id, TENANT, (row) => ({
        ...row,
        status: "po_received",
        activities: [
          ...row.activities,
          {
            id: "act-status",
            at: new Date().toISOString(),
            actorRole: "staff",
            actorEmail: staff.email,
            kind: "status",
            text: "PO received",
          },
        ],
      })),
    ]);

    const loaded = await getMachine(machineId, TENANT);
    assert.ok(loaded);
    const after = await mutateQuote(quote.id, TENANT, (row) => row);
    assert.ok(after);
    assert.equal(after.status, "po_received");
    assert.ok(after.lastReadAt?.[staff.id]);
  });

  it("parallel append activities keep both messages", async () => {
    seedCatalog();
    const machines = await listMachines(TENANT);
    const machineId = machines[0]?.id;
    assert.ok(machineId);
    const quote = await createQuote(TENANT, {
      machineId,
      customerId: "user-customer",
      items: [{ id: "part-1", qty: 1, name: "Bearing" }],
      note: "concurrency",
    });
    const staff = { id: "user-staff", email: "staff@demo.com", role: "staff" as const };

    await Promise.all([
      appendQuoteActivity(quote.id, TENANT, staff, "message", "Message A"),
      appendQuoteActivity(quote.id, TENANT, staff, "message", "Message B"),
    ]);

    const after = await mutateQuote(quote.id, TENANT, (row) => row);
    assert.ok(after);
    const texts = after.activities.map((row) => row.text);
    assert.ok(texts.includes("Message A"));
    assert.ok(texts.includes("Message B"));
  });
});

describe("catalog memory cache (blob etag gate)", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("reuses memory when peek versions match", async () => {
    const inner = createMemoryPersistence();
    let peekCalls = 0;
    const persistence = {
      ...inner,
      kind: "blob" as const,
      async peekCatalogVersions() {
        peekCalls += 1;
        return inner.peekCatalogVersions();
      },
    };
    setPersistenceForTests(persistence);
    resetStoreMemoryForTests();
    process.env.SPARES_ALLOW_SEED = "1";
    const { findUserByEmail } = await import("./store.ts");
    await findUserByEmail("staff@demo.com");
    peekCalls = 0;
    await findUserByEmail("staff@demo.com");
    assert.ok(peekCalls >= 1);
    await findUserByEmail("staff@demo.com");
    assert.ok(peekCalls >= 2);
  });
});
