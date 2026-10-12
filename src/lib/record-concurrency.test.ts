import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import { RecordWriteConflictError } from "./record-conflict.ts";
import {
  createQuote,
  createTicket,
  getTicket,
  listMachines,
  mutateQuote,
  resetStoreMemoryForTests,
  seedEmptyMachineCatalogForTests,
  updateTicketStatus,
} from "./store.ts";
import { readRecordVersion } from "./record-meta.ts";
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

  it("returns a record conflict when two writers touch the same ticket status", async () => {
    seedCatalog();
    const machines = await listMachines(TENANT);
    const machineId = machines[0]?.id;
    assert.ok(machineId);
    const created = await createTicket(TENANT, {
      machineId,
      title: "Concurrency",
      customerId: "user-customer",
      customerEmail: "user@demo.com",
      actor: { id: "staff-a", email: "staff-a@demo.com", role: "staff" },
    });
    if ("error" in created) {
      throw new Error("ticket create failed");
    }
    const { ticket } = created;
    const base = { ...ticket, recordVersion: 1 };
    const actor = { id: "staff-a", email: "staff-a@demo.com", role: "staff" as const };
    await updateTicketStatus(ticket.id, TENANT, "in_progress", actor, {
      actor: { id: actor.id, email: actor.email, name: "Staff A" },
      lock: { base, expectedVersion: 1, touchedFields: ["status"] },
    });
    await assert.rejects(
      () =>
        updateTicketStatus(ticket.id, TENANT, "closed", actor, {
          actor: { id: "staff-b", email: "staff-b@demo.com", name: "Staff B" },
          lock: { base, expectedVersion: 1, touchedFields: ["status"] },
        }),
      (cause: unknown) => cause instanceof RecordWriteConflictError,
    );
  });

  it("allows same-writer status when only the client recordVersion is stale", async () => {
    seedCatalog();
    const machines = await listMachines(TENANT);
    const machineId = machines[0]?.id;
    assert.ok(machineId);
    const created = await createTicket(TENANT, {
      machineId,
      title: "Self rebase",
      customerId: "user-customer",
      customerEmail: "user@demo.com",
      actor: { id: "staff-a", email: "staff-a@demo.com", role: "staff" },
    });
    if ("error" in created) {
      throw new Error("ticket create failed");
    }
    const { ticket } = created;
    const actor = { id: "staff-a", email: "staff-a@demo.com", role: "staff" as const };
    const bumped = await updateTicketStatus(ticket.id, TENANT, "in_progress", actor, {
      actor: { id: actor.id, email: actor.email, name: "Staff A" },
      lock: {
        base: ticket,
        expectedVersion: readRecordVersion(ticket),
        touchedFields: ["status"],
      },
    });
    assert.ok(bumped);
    const next = await updateTicketStatus(ticket.id, TENANT, "closed", actor, {
      actor: { id: actor.id, email: actor.email, name: "Staff A" },
      lock: {
        base: bumped,
        expectedVersion: readRecordVersion(ticket),
        touchedFields: ["status"],
      },
    });
    assert.equal(next?.status, "closed");
  });

  it("rejects same-field status when another writer advanced the version", async () => {
    seedCatalog();
    const machines = await listMachines(TENANT);
    const machineId = machines[0]?.id;
    assert.ok(machineId);
    const created = await createTicket(TENANT, {
      machineId,
      title: "Stale version",
      customerId: "user-customer",
      customerEmail: "user@demo.com",
      actor: { id: "staff-a", email: "staff-a@demo.com", role: "staff" },
    });
    if ("error" in created) {
      throw new Error("ticket create failed");
    }
    const { ticket } = created;
    const actor = { id: "staff-a", email: "staff-a@demo.com", role: "staff" as const };
    const bumped = await updateTicketStatus(ticket.id, TENANT, "in_progress", actor, {
      actor: { id: actor.id, email: actor.email, name: "Staff A" },
      lock: {
        base: ticket,
        expectedVersion: readRecordVersion(ticket),
        touchedFields: ["status"],
      },
    });
    assert.ok(bumped);
    await assert.rejects(
      () =>
        updateTicketStatus(ticket.id, TENANT, "closed", actor, {
          actor: { id: "staff-b", email: "staff-b@demo.com", name: "Staff B" },
          lock: {
            base: bumped,
            expectedVersion: readRecordVersion(ticket),
            touchedFields: ["status"],
          },
        }),
      (cause: unknown) => cause instanceof RecordWriteConflictError,
    );
  });
});
