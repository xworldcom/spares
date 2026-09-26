import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { canAccessMachine } from "./access.ts";
import { hashPassword } from "./auth/password.ts";
import { canAccessCareMachine } from "./care.ts";
import { canViewQuote } from "./quotes.ts";
import { setPersistenceForTests } from "./persistence.ts";
import {
  createCustomer,
  createCustomerAccount,
  createMachine,
  createManual,
  createQuote,
  createSite,
  createTenantStaffUser,
  createTicket,
  getManual,
  getOrgContext,
  getQuote,
  getTicket,
  listMachines,
  listManuals,
  listQuotes,
  listTickets,
  resetStoreMemoryForTests,
  updatePerson,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const HOST = DEFAULT_TENANT_ID;

async function isolated() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-plant-"));
  process.env.SPARES_DATA_DIR = dir;
  process.env.SPARES_ALLOW_SEED = "false";
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
}

async function createPlant(label: string) {
  const account = await createCustomerAccount(`Plant ${label}`, HOST);
  assert.ok("account" in account, JSON.stringify(account));
  const site = await createSite(HOST, account.account.id, `${label} floor`);
  assert.ok("site" in site, JSON.stringify(site));
  const machine = await createMachine(HOST, {
    name: `Line ${label}`,
    storedFileName: `line-${label.toLowerCase()}.glb`,
    originalFileName: `line-${label.toLowerCase()}.glb`,
    parts: [{ id: `${label}1`, name: `${label} part`, qty: 1 }],
    unmatched: [],
    siteId: site.site.id,
  });
  const user = await createCustomer(
    HOST,
    `${label.toLowerCase()}@plant.test`,
    await hashPassword(`Plant${label}1!`),
    { machineIds: [machine.id] },
  );
  assert.ok("user" in user, JSON.stringify(user));
  const quote = await createQuote(HOST, {
    machineId: machine.id,
    items: [{ id: `${label}1`, qty: 1 }],
    customerId: user.user.id,
    customerEmail: user.user.email,
  });
  assert.ok(!("error" in quote), JSON.stringify(quote));
  const ticket = await createTicket(HOST, {
    machineId: machine.id,
    title: `Plant ${label} ticket`,
    customerId: user.user.id,
    customerEmail: user.user.email,
    actor: { id: user.user.id, email: user.user.email, role: "customer" },
  });
  assert.ok("ticket" in ticket, JSON.stringify(ticket));
  const manual = await createManual(HOST, {
    machineId: machine.id,
    title: `Plant ${label} operator guide`,
    category: "operator",
    storedFileName: `manual-${label.toLowerCase()}.pdf`,
    originalFileName: `manual-${label.toLowerCase()}.pdf`,
    contentType: "application/pdf",
    uploadedByEmail: "staff@plant.test",
  });
  assert.ok("manual" in manual, JSON.stringify(manual));
  return {
    account: account.account,
    site: site.site,
    machine,
    user: user.user,
    quote,
    ticket: ticket.ticket,
    manual: manual.manual,
  };
}

describe("same-host plant isolation", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("keeps Plant A out of Plant B through the route helpers", async () => {
    await isolated();
    const a = await createPlant("A");
    const b = await createPlant("B");
    const staffRow = await createTenantStaffUser(HOST, {
      email: "staff@plant.test",
      passwordHash: await hashPassword("PlantStaff1!"),
      role: "staff",
    });
    assert.ok("user" in staffRow);
    const staff = staffRow.user;

    const org = await getOrgContext(HOST);
    const machines = await listMachines(HOST);
    assert.deepEqual(
      machines.map((row) => row.id).sort(),
      [a.machine.id, b.machine.id].sort(),
    );

    const visibleTo = (user: typeof a.user) =>
      machines
        .filter((machine) => canAccessMachine(user, machine, org.sites, org.customers))
        .map((machine) => machine.id);
    assert.deepEqual(visibleTo(a.user), [a.machine.id]);
    assert.deepEqual(visibleTo(b.user), [b.machine.id]);

    assert.equal(canAccessMachine(a.user, b.machine, org.sites, org.customers), false);
    assert.equal(canAccessCareMachine(a.user, b.machine, org.sites, org.customers), false);
    assert.equal(canAccessMachine(a.user, a.machine, org.sites, org.customers), true);

    const tickets = await listTickets(HOST);
    assert.equal(tickets.length, 2);
    const visibleMachines = new Set(visibleTo(a.user));
    assert.deepEqual(
      tickets.filter((ticket) => visibleMachines.has(ticket.machineId)).map((row) => row.id),
      [a.ticket.id],
    );

    const ticketB = await getTicket(b.ticket.id, HOST);
    assert.equal(ticketB?.id, b.ticket.id);
    assert.equal(canAccessCareMachine(a.user, b.machine, org.sites, org.customers), false);

    const quotes = await listQuotes(HOST);
    assert.equal(quotes.length, 2);
    assert.deepEqual(
      quotes.filter((quote) => quote.customerId === a.user.id).map((row) => row.id),
      [a.quote.id],
    );
    const quoteB = await getQuote(b.quote.id, HOST);
    assert.equal(quoteB?.id, b.quote.id);
    assert.equal(canViewQuote(b.quote, a.user), false);
    assert.equal(canViewQuote(a.quote, a.user), true);

    assert.deepEqual(
      (await listManuals(a.machine.id, HOST)).map((row) => row.id),
      [a.manual.id],
    );
    const manualB = await getManual(b.machine.id, b.manual.id, HOST);
    assert.equal(manualB?.id, b.manual.id);
    assert.equal(canAccessCareMachine(a.user, b.machine, org.sites, org.customers), false);

    const revoked = await updatePerson(a.user.id, HOST, { machineIds: [] });
    assert.ok("user" in revoked, JSON.stringify(revoked));
    assert.deepEqual(revoked.user.machineIds, []);
    assert.equal(canAccessMachine(revoked.user, a.machine, org.sites, org.customers), false);
    assert.equal(canViewQuote(a.quote, revoked.user), true);

    assert.equal(canAccessMachine(staff, a.machine, org.sites, org.customers), true);
    assert.equal(canAccessMachine(staff, b.machine, org.sites, org.customers), true);
  });
});
