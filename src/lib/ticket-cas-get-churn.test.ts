/**
 * Reproduces prod f03d568 first single-session false 409: GET markTicketRead used to
 * bump recordVersion without a status change, then PATCH with the UI's stale version 409'd.
 * Fails on f03d568 without read-watermark stamp + field-snapshot CAS; passes on fix.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createMemoryPersistence, setPersistenceForTests } from "./persistence.ts";
import {
  createTicket,
  listMachines,
  markTicketRead,
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
      email: "staff@demo.com",
      passwordHash: "x",
      role: "staff",
      tenantId: TENANT,
      name: "Demo staff",
    },
  ]);
}

describe("ticket CAS GET churn (client-path prerequisite)", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("first status PATCH succeeds after staff GET mark-read churn", async () => {
    seedCatalog();
    const machines = await listMachines(TENANT);
    const machineId = machines[0]?.id;
    assert.ok(machineId);
    const created = await createTicket(TENANT, {
      machineId,
      title: "GET churn",
      customerId: "c1",
      customerEmail: "user@demo.com",
      actor: { id: "staff-a", email: "staff@demo.com", role: "staff" },
    });
    if ("error" in created) {
      throw new Error("create failed");
    }
    const { ticket } = created;
    const versionAtLoad = readRecordVersion(ticket);
    await markTicketRead(ticket.id, TENANT, "staff-a");
    await markTicketRead(ticket.id, TENANT, "staff-a");
    const afterReads = await markTicketRead(ticket.id, TENANT, "staff-a");
    assert.ok(afterReads);
    assert.equal(readRecordVersion(afterReads), versionAtLoad);
    const actor = { id: "staff-a", email: "staff@demo.com", role: "staff" as const };
    const saved = await updateTicketStatus(ticket.id, TENANT, "in_progress", actor, {
      actor: { id: actor.id, email: actor.email, name: "Demo staff" },
      lock: {
        base: { ...ticket, status: "open" },
        expectedVersion: versionAtLoad,
        touchedFields: ["status"],
      },
    });
    assert.equal(saved?.status, "in_progress");
  });
});
