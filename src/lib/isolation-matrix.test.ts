import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { canAccessMachine } from "./access.ts";
import { hashPassword } from "./auth/password.ts";
import { canViewQuote } from "./quotes.ts";
import { setPersistenceForTests } from "./persistence.ts";
import {
  createCustomer,
  createMachine,
  createQuote,
  createTenant,
  createTenantStaffUser,
  createTicket,
  getMachine,
  getQuote,
  getTicket,
  listCustomers,
  listMachines,
  listQuotes,
  listTickets,
  resetStoreMemoryForTests,
  updatePerson,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-iso-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

describe("two-host isolation matrix", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("keeps machines, quotes, tickets, and people inside their host", async () => {
    await isolated();
    const satellite = await createTenant("Satellite Host");
    assert.ok("tenant" in satellite);
    if (!("tenant" in satellite)) {
      return;
    }
    const satId = satellite.tenant.id;

    const hostMachine = await createMachine(DEFAULT_TENANT_ID, {
      name: "Host line",
      storedFileName: "host.glb",
      originalFileName: "host.glb",
      parts: [{ id: "H1", name: "Host part", qty: 1 }],
      unmatched: [],
    });
    const satMachine = await createMachine(satId, {
      name: "Sat line",
      storedFileName: "sat.glb",
      originalFileName: "sat.glb",
      parts: [{ id: "S1", name: "Sat part", qty: 1 }],
      unmatched: [],
    });

    const hostCust = await createCustomer(
      DEFAULT_TENANT_ID,
      "a@host.test",
      await hashPassword("IsolationA1!"),
      { machineIds: [hostMachine.id] },
    );
    assert.ok("user" in hostCust);
    const satCust = await createCustomer(
      satId,
      "b@sat.test",
      await hashPassword("IsolationB1!"),
      { machineIds: [satMachine.id] },
    );
    assert.ok("user" in satCust);

    const hostQuote = await createQuote(DEFAULT_TENANT_ID, {
      machineId: hostMachine.id,
      items: [{ id: "H1", qty: 1 }],
      customerId: hostCust.user.id,
      customerEmail: hostCust.user.email,
    });
    assert.ok(!("error" in hostQuote));
    const satQuote = await createQuote(satId, {
      machineId: satMachine.id,
      items: [{ id: "S1", qty: 1 }],
      customerId: satCust.user.id,
      customerEmail: satCust.user.email,
    });
    assert.equal("error" in satQuote, false, JSON.stringify(satQuote));

    const hostTicket = await createTicket(DEFAULT_TENANT_ID, {
      machineId: hostMachine.id,
      title: "Host ticket",
      customerId: hostCust.user.id,
      customerEmail: hostCust.user.email,
      actor: { id: hostCust.user.id, email: hostCust.user.email, role: "customer" },
    });
    assert.ok("ticket" in hostTicket);
    const satTicket = await createTicket(satId, {
      machineId: satMachine.id,
      title: "Sat ticket",
      customerId: satCust.user.id,
      customerEmail: satCust.user.email,
      actor: { id: satCust.user.id, email: satCust.user.email, role: "customer" },
    });
    assert.ok("ticket" in satTicket);

    assert.equal(await getMachine(hostMachine.id, satId), null);
    assert.equal(await getMachine(satMachine.id, DEFAULT_TENANT_ID), null);
    assert.equal(
      (await listMachines(satId)).some((row) => row.id === hostMachine.id),
      false,
    );

    assert.equal(await getQuote(hostQuote.id, satId), null);
    assert.equal(await getQuote(String(hostQuote.number), satId), null);
    assert.equal(await getQuote(satQuote.id, DEFAULT_TENANT_ID), null);
    assert.ok(await getQuote(String(satQuote.number), satId));
    assert.equal(
      (await listQuotes(satId)).some((row) => row.id === hostQuote.id),
      false,
    );

    assert.equal(await getTicket(hostTicket.ticket.id, satId), null);
    assert.equal(await getTicket(String(hostTicket.ticket.number), satId), null);
    assert.ok(await getTicket(satTicket.ticket.id, satId));
    assert.equal(
      (await listTickets(satId)).some((row) => row.id === hostTicket.ticket.id),
      false,
    );

    assert.equal(
      (await listCustomers(satId)).some((row) => row.id === hostCust.user.id),
      false,
    );
    assert.equal(
      (await listCustomers(DEFAULT_TENANT_ID)).some((row) => row.id === satCust.user.id),
      false,
    );

    assert.equal(canViewQuote(hostQuote, satCust.user), false);
    assert.equal(canViewQuote(satQuote, hostCust.user), false);
    assert.equal(canViewQuote(hostQuote, hostCust.user), true);

    assert.equal(
      canAccessMachine(
        { ...hostCust.user, role: "customer", tenantId: DEFAULT_TENANT_ID },
        satMachine,
      ),
      false,
    );
    assert.equal(
      canAccessMachine(
        { ...satCust.user, role: "customer", tenantId: satId },
        hostMachine,
      ),
      false,
    );
  });

  it("refuses a satellite rename onto a live host login", async () => {
    await isolated();
    const satellite = await createTenant("Rename Host");
    assert.ok("tenant" in satellite);
    if (!("tenant" in satellite)) {
      return;
    }
    const host = await createTenantStaffUser(DEFAULT_TENANT_ID, {
      email: "owner@host.test",
      passwordHash: await hashPassword("IsolationOwner1!"),
      role: "staff",
    });
    assert.ok("user" in host);
    const satPerson = await createCustomer(
      satellite.tenant.id,
      "rename@sat.test",
      await hashPassword("IsolationRename1!"),
    );
    assert.ok("user" in satPerson);

    const taken = await updatePerson(satPerson.user.id, satellite.tenant.id, {
      email: "owner@host.test",
    });
    assert.ok("error" in taken);
    assert.equal(taken.error, "email-taken");
  });

  it("drops foreign machine ids when staff create a customer", async () => {
    await isolated();
    const satellite = await createTenant("Grant Host");
    assert.ok("tenant" in satellite);
    if (!("tenant" in satellite)) {
      return;
    }
    const hostMachine = await createMachine(DEFAULT_TENANT_ID, {
      name: "Host only",
      storedFileName: "host-grant.glb",
      originalFileName: "host-grant.glb",
      parts: [],
      unmatched: [],
    });
    const created = await createCustomer(
      satellite.tenant.id,
      "grant@sat.test",
      await hashPassword("IsolationGrant1!"),
      { machineIds: [hostMachine.id] },
    );
    assert.ok("user" in created);
    assert.deepEqual(created.user.machineIds, []);
  });
});
