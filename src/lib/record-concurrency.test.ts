import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import { RecordWriteConflictError } from "./record-conflict.ts";
import {
  createQuote,
  listMachines,
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
      id: "staff-a",
      email: "staff-a@demo.com",
      passwordHash: "x",
      role: "staff",
      tenantId: TENANT,
      name: "Staff A",
    },
    {
      id: "staff-b",
      email: "staff-b@demo.com",
      passwordHash: "x",
      role: "staff",
      tenantId: TENANT,
      name: "Staff B",
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

describe("record version conflicts", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("returns a record conflict when two writers touch the same quote field", async () => {
    seedCatalog();
    const machines = await listMachines(TENANT);
    const machineId = machines[0]?.id;
    assert.ok(machineId);
    const quote = await createQuote(TENANT, {
      machineId,
      customerId: "user-customer",
      items: [{ id: "part-1", qty: 1, name: "Bearing" }],
    });
    const base = { ...quote, recordVersion: 1 };
    await mutateQuote(
      quote.id,
      TENANT,
      (row) => ({ ...row, status: "pricing" }),
      {
        actor: { id: "staff-a", email: "staff-a@demo.com", name: "Staff A" },
        lock: { base, expectedVersion: 1, touchedFields: ["status"] },
      },
    );
    await assert.rejects(
      () =>
        mutateQuote(
          quote.id,
          TENANT,
          (row) => ({ ...row, status: "quoted" }),
          {
            actor: { id: "staff-b", email: "staff-b@demo.com", name: "Staff B" },
            lock: { base, expectedVersion: 1, touchedFields: ["status"] },
          },
        ),
      (cause: unknown) => cause instanceof RecordWriteConflictError,
    );
  });
});
