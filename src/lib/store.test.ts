import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { canAccessMachine } from "./access.ts";
import {
  FIXTURE_MACHINE_IDS,
} from "./seed-fixtures.ts";
import {
  createMemoryPersistence,
  setPersistenceForTests,
} from "./persistence.ts";
import {
  appendQuoteActivity,
  appendTicketActivity,
  createCustomer,
  createCustomerAccount,
  createMachine,
  createManual,
  createQuote,
  createSite,
  createTicket,
  deleteMachine,
  findOrCreateModelLessMachine,
  findUserByEmail,
  getMachine,
  getMachineUsage,
  getQuote,
  getTicket,
  listMachines,
  listManuals,
  listTickets,
  readStoredFile,
  resetStoreMemoryForTests,
  saveMachineFile,
  seedEmptyMachineCatalogForTests,
  updateMachine,
  updateMachineUsage,
  updateTicketStatus,
} from "./store.ts";
import { DEFAULT_TENANT_ID } from "./tenant.ts";

const T = DEFAULT_TENANT_ID;

async function isolatedDataDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-store-"));
  process.env.SPARES_DATA_DIR = dir;
  setPersistenceForTests(null);
  await mkdir(path.join(dir, "files"), { recursive: true });
  resetStoreMemoryForTests();
  return dir;
}

const seedUsers = [
  {
    id: "user-staff",
    email: "staff@spares.local",
    passwordHash: "x",
    role: "staff" as const,
  },
  {
    id: "user-customer",
    email: "customer@spares.local",
    passwordHash: "x",
    role: "customer" as const,
  },
];

describe("owner staff bootstrap", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_OWNER_EMAIL;
    delete process.env.SPARES_OWNER_PASSWORD;
  });

  it("upserts a staff owner from env on catalog read", async () => {
    await isolatedDataDir();
    process.env.SPARES_OWNER_EMAIL = "kevin@huzevka.com";
    process.env.SPARES_OWNER_PASSWORD = "OwnerPreviewOnly1!";
    const machines = await listMachines(T);
    assert.ok(machines.length >= 0);
    const { findUserByEmail } = await import("./store.ts");
    const owner = await findUserByEmail("kevin@huzevka.com");
    assert.ok(owner);
    assert.equal(owner?.role, "staff");
  });
});

describe("listMachines catalog heal", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
  });

  it("seeds fixtures from a db that has users but no machines", async () => {
    const dir = await isolatedDataDir();
    await writeFile(
      path.join(dir, "db.json"),
      JSON.stringify({
        users: seedUsers,
        machines: [],
        quotes: [],
        bugReports: [],
      }),
    );

    const machines = await listMachines(T);
    const ids = machines.map((machine) => machine.id).sort();
    assert.deepEqual(ids, [
      FIXTURE_MACHINE_IDS.hardware,
      FIXTURE_MACHINE_IDS.palletizer,
    ].sort());
  });

  it("re-seeds when in-memory catalog is warm and empty", async () => {
    await isolatedDataDir();
    seedEmptyMachineCatalogForTests(seedUsers);

    const machines = await listMachines(T);
    assert.ok(machines.some((machine) => machine.id === FIXTURE_MACHINE_IDS.hardware));
    assert.ok(machines.some((machine) => machine.id === FIXTURE_MACHINE_IDS.palletizer));
  });

  it("heal=true drops memory and rebuilds fixtures", async () => {
    await isolatedDataDir();
    seedEmptyMachineCatalogForTests(seedUsers);

    const machines = await listMachines(T, { heal: true });
    assert.equal(machines.length, 2);
  });
});

describe("durable store survives a process hop", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
  });

  it("keeps quotes, activity, and files on disk after memory is cleared", async () => {
    await isolatedDataDir();
    await listMachines(T);

    const quote = await createQuote(T, {
      machineId: FIXTURE_MACHINE_IDS.hardware,
      items: [{ id: "5972K325", qty: 1, name: "Bearing" }],
      customerId: "user-customer",
      customerEmail: "customer@spares.local",
    });
    await appendQuoteActivity(
      quote.id,
      T,
      { id: "user-staff", email: "staff@spares.local", role: "staff" },
      "message",
      "Checking lead time.",
    );
    await saveMachineFile(`po-${quote.id}.pdf`, Buffer.from("%PDF-1.4 hop"));

    resetStoreMemoryForTests();

    const again = await getQuote(quote.id, T);
    assert.equal(again?.id, quote.id);
    assert.equal(again?.activities.length, 2);
    assert.equal(again?.activities[1]?.text, "Checking lead time.");
    assert.equal(
      (await readStoredFile(`po-${quote.id}.pdf`)).toString(),
      "%PDF-1.4 hop",
    );
  });

  it("ignores stale process memory when the backend is remote", async () => {
    delete process.env.SPARES_DATA_DIR;
    const remote = createMemoryPersistence();
    setPersistenceForTests(remote);
    resetStoreMemoryForTests();

    await listMachines(T);
    const quote = await createQuote(T, {
      machineId: FIXTURE_MACHINE_IDS.palletizer,
      items: [{ id: "PN-FRAME-1000", qty: 2, name: "Frame" }],
      customerId: "user-customer",
      customerEmail: "customer@spares.local",
    });
    await appendQuoteActivity(
      quote.id,
      T,
      { id: "user-customer", email: "customer@spares.local", role: "customer" },
      "message",
      "Need this on Friday.",
    );
    await saveMachineFile("po-remote.pdf", Buffer.from("PO bytes"));

    seedEmptyMachineCatalogForTests(seedUsers);
    const poisoned = await getQuote(quote.id, T);
    assert.equal(poisoned?.id, quote.id);

    resetStoreMemoryForTests();

    const machines = await listMachines(T);
    assert.ok(machines.some((machine) => machine.id === FIXTURE_MACHINE_IDS.hardware));
    const again = await getQuote(quote.id, T);
    assert.equal(again?.activities.at(-1)?.text, "Need this on Friday.");
    assert.equal((await readStoredFile("po-remote.pdf")).toString(), "PO bytes");
  });
});

describe("staff part join edits", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
  });

  it("saves a mesh assignment and keeps other joined parts pickable", async () => {
    await isolatedDataDir();

    const created = await createMachine(T, {
      name: "Staff QA cell",
      storedFileName: "qa-cell.glb",
      originalFileName: "qa-cell.glb",
      parts: [
        { id: "PN-FRAME-1000", name: "Frame weldment", meshName: "PN-FRAME-1000", qty: 1 },
        { id: "PN-ROLL-2104", name: "Drive roller", meshName: "PN-ROLL-2104", qty: 2 },
      ],
      unmatched: [
        { source: "list", id: "PN-BELT-4402", name: "Conveyor belt", qty: 1 },
        { source: "model", meshName: "PN-GRD-5503" },
      ],
    });

    const updated = await updateMachine(created.id, T, {
      part: {
        key: "list:PN-BELT-4402",
        partNumber: "PN-BELT-4402",
        name: "Conveyor belt",
        meshName: "PN-GRD-5503",
        qty: 1,
      },
    });
    assert.equal("error" in updated, false);
    if ("error" in updated) {
      return;
    }

    const belt = updated.machine.parts.find((part) => part.id === "PN-BELT-4402");
    assert.equal(belt?.meshName, "PN-GRD-5503");
    assert.equal(updated.machine.parts.some((part) => part.id === "PN-FRAME-1000"), true);
    assert.equal(
      updated.machine.unmatched.some((row) => row.source === "list"),
      false,
    );

    resetStoreMemoryForTests();
    const again = await getMachine(created.id, T);
    assert.equal(again?.parts.find((part) => part.id === "PN-BELT-4402")?.meshName, "PN-GRD-5503");
    assert.equal(again?.parts.find((part) => part.id === "PN-ROLL-2104")?.qty, 2);
  });
});

describe("machine care store", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.VERCEL;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("persists manuals, tickets, and usage across a memory reset", async () => {
    await isolatedDataDir();
    const created = await createMachine(T, {
      name: "Care cell",
      storedFileName: "care-cell.glb",
      originalFileName: "care-cell.glb",
      parts: [{ id: "PN-1", name: "Frame", meshName: "PN-1", qty: 1 }],
      unmatched: [],
    });

    const manual = await createManual(T, {
      machineId: created.id,
      title: "Operator guide",
      category: "operator",
      storedFileName: "operator-guide.pdf",
      originalFileName: "Operator guide.pdf",
      contentType: "application/pdf",
      sizeBytes: 12,
      uploadedByEmail: "staff@spares.local",
      bytes: Buffer.from("%PDF-1.4 care"),
    });
    assert.equal("error" in manual, false);
    if ("error" in manual) {
      return;
    }

    const ticket = await createTicket(T, {
      machineId: created.id,
      title: "Belt slip",
      customerId: "user-customer",
      customerEmail: "customer@spares.local",
      actor: {
        id: "user-customer",
        email: "customer@spares.local",
        role: "customer",
      },
      note: "Started after the last changeover.",
    });
    assert.equal("error" in ticket, false);
    if ("error" in ticket) {
      return;
    }
    await updateTicketStatus(ticket.ticket.id, T, "in_progress", {
      id: "user-staff",
      email: "staff@spares.local",
      role: "staff",
    });
    await appendTicketActivity(
      ticket.ticket.id,
      T,
      {
        id: "user-staff",
        email: "staff@spares.local",
        role: "staff",
      },
      "On site Friday.",
    );

    const usage = await updateMachineUsage(
      created.id,
      T,
      { hours: 1240, cycles: 88000, lastServiceAt: "2026-09-01", notes: "Greased rails" },
      "staff@spares.local",
    );
    assert.equal("error" in usage, false);

    resetStoreMemoryForTests();

    const manuals = await listManuals(created.id, T);
    assert.equal(manuals[0]?.title, "Operator guide");
    assert.equal((await readStoredFile("operator-guide.pdf")).toString(), "%PDF-1.4 care");

    const tickets = await listTickets(T, created.id);
    assert.equal(tickets[0]?.status, "in_progress");
    assert.equal(tickets[0]?.activities.at(-1)?.text, "On site Friday.");

    const again = await getMachineUsage(created.id, T);
    assert.equal(again?.hours, 1240);
    assert.equal(again?.history[0]?.summary.includes("hours"), true);

    await deleteMachine(created.id, T);
    resetStoreMemoryForTests();
    assert.equal((await listManuals(created.id, T)).length, 0);
    assert.equal((await listTickets(T, created.id)).length, 0);
    assert.equal(await getMachineUsage(created.id, T), null);
  });

  it("keeps tickets on the staff queue after a remote catalog heal", async () => {
    delete process.env.SPARES_DATA_DIR;
    process.env.VERCEL = "1";
    const remote = createMemoryPersistence();
    setPersistenceForTests(remote);
    resetStoreMemoryForTests();
    seedEmptyMachineCatalogForTests(seedUsers);
    await remote.writeDatabaseJson(
      JSON.stringify({
        users: seedUsers,
        machines: [],
        quotes: [],
        bugReports: [],
        sites: [],
      }),
    );
    resetStoreMemoryForTests();

    const created = await createMachine(T, {
      name: "Remote care cell",
      storedFileName: "remote-care.glb",
      originalFileName: "remote-care.glb",
      parts: [{ id: "PN-1", name: "Frame", meshName: "PN-1", qty: 1 }],
      unmatched: [],
    });
    const opened = await createTicket(T, {
      machineId: created.id,
      title: "Guard rattles",
      customerId: "user-customer",
      customerEmail: "customer@spares.local",
      actor: {
        id: "user-customer",
        email: "customer@spares.local",
        role: "customer",
      },
      note: "After washdown.",
    });
    assert.equal("error" in opened, false);
    if ("error" in opened) {
      return;
    }

    const stale = JSON.parse((await remote.readDatabaseJson()) ?? "{}") as {
      tickets?: unknown;
    };
    delete stale.tickets;
    await remote.writeDatabaseJson(JSON.stringify(stale));
    resetStoreMemoryForTests();

    const queued = await listTickets(T);
    const byMachine = await listTickets(T, created.id);
    const detail = await getTicket(opened.ticket.id, T);
    assert.equal(queued.some((ticket) => ticket.id === opened.ticket.id), true);
    assert.equal(byMachine.some((ticket) => ticket.id === opened.ticket.id), true);
    assert.equal(detail?.title, "Guard rattles");
    assert.equal(detail?.id, opened.ticket.id);

    seedEmptyMachineCatalogForTests(seedUsers);
    await listMachines(T, { heal: true });
    resetStoreMemoryForTests();
    assert.equal(
      (await listTickets(T)).some((ticket) => ticket.id === opened.ticket.id),
      true,
    );
    assert.equal((await getTicket(opened.ticket.id, T))?.number, opened.ticket.number);
  });

  it("keeps ticket messages when care.json lags behind db.json", async () => {
    delete process.env.SPARES_DATA_DIR;
    process.env.VERCEL = "1";
    const remote = createMemoryPersistence();
    setPersistenceForTests(remote);
    resetStoreMemoryForTests();
    seedEmptyMachineCatalogForTests(seedUsers);
    await remote.writeDatabaseJson(
      JSON.stringify({
        users: seedUsers,
        machines: [],
        quotes: [],
        bugReports: [],
        sites: [],
      }),
    );
    resetStoreMemoryForTests();

    const created = await createMachine(T, {
      name: "Chat cell",
      storedFileName: "chat-cell.glb",
      originalFileName: "chat-cell.glb",
      parts: [{ id: "PN-1", name: "Frame", meshName: "PN-1", qty: 1 }],
      unmatched: [],
    });
    const opened = await createTicket(T, {
      machineId: created.id,
      title: "Noisy bearing",
      customerId: "user-customer",
      customerEmail: "customer@spares.local",
      actor: {
        id: "user-customer",
        email: "customer@spares.local",
        role: "customer",
      },
    });
    assert.equal("error" in opened, false);
    if ("error" in opened) {
      return;
    }
    await appendTicketActivity(
      opened.ticket.id,
      T,
      {
        id: "user-staff",
        email: "staff@spares.local",
        role: "staff",
      },
      "We can visit Tuesday.",
    );

    const care = JSON.parse((await remote.readCareJson()) ?? "{}") as {
      tickets?: { id: string; activities: { text: string }[] }[];
    };
    const ticket = care.tickets?.find((row) => row.id === opened.ticket.id);
    assert.ok(ticket);
    ticket.activities = ticket.activities.filter(
      (row) => row.text !== "We can visit Tuesday.",
    );
    await remote.writeCareJson(JSON.stringify(care));
    resetStoreMemoryForTests();

    const detail = await getTicket(opened.ticket.id, T);
    assert.equal(detail?.activities.at(-1)?.text, "We can visit Tuesday.");
  });
});

describe("quote conversation persistence", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.VERCEL;
  });

  it("reloads quote messages for staff and customer accessors", async () => {
    await isolatedDataDir();
    await listMachines(T);

    const quote = await createQuote(T, {
      machineId: FIXTURE_MACHINE_IDS.hardware,
      items: [{ id: "5972K325", qty: 1, name: "Bearing" }],
      customerId: "user-customer",
      customerEmail: "customer@spares.local",
    });
    await appendQuoteActivity(
      quote.id,
      T,
      { id: "user-customer", email: "customer@spares.local", role: "customer" },
      "message",
      "Can you confirm lead time?",
    );
    await appendQuoteActivity(
      quote.id,
      T,
      { id: "user-staff", email: "staff@spares.local", role: "staff" },
      "message",
      "About two weeks.",
    );

    resetStoreMemoryForTests();

    const byId = await getQuote(quote.id, T);
    const byNumber = await getQuote(String(quote.number), T);
    assert.equal(byId?.activities.at(-1)?.text, "About two weeks.");
    assert.equal(byNumber?.activities.length, byId?.activities.length);
    assert.equal(byNumber?.activities.at(-2)?.text, "Can you confirm lead time?");
  });
});

describe("model-less machines", () => {
  after(() => {
    resetStoreMemoryForTests();
    setPersistenceForTests(null);
    delete process.env.SPARES_DATA_DIR;
    delete process.env.SPARES_ALLOW_SEED;
  });

  it("creates a real machine without a pack and reuses the name at that site", async () => {
    await isolatedDataDir();
    process.env.SPARES_ALLOW_SEED = "false";
    const account = await createCustomerAccount("Cargill", T);
    assert.equal("account" in account, true);
    if (!("account" in account)) {
      return;
    }
    const site = await createSite(T, account.account.id, "Fort Worth");
    assert.equal("site" in site, true);
    if (!("site" in site)) {
      return;
    }
    const first = await findOrCreateModelLessMachine(T, {
      name: "Fanuc R-2000",
      siteId: site.site.id,
      oem: "Fanuc",
    });
    assert.equal("machine" in first, true);
    if (!("machine" in first)) {
      return;
    }
    assert.equal(first.created, true);
    assert.equal(first.machine.storedFileName, "");
    assert.equal(first.machine.parts.length, 0);
    assert.equal(first.machine.siteId, site.site.id);
    assert.equal(first.machine.oem, "Fanuc");

    const again = await findOrCreateModelLessMachine(T, {
      name: "  fanuc   r-2000 ",
      siteId: site.site.id,
    });
    assert.equal("machine" in again, true);
    if (!("machine" in again)) {
      return;
    }
    assert.equal(again.created, false);
    assert.equal(again.machine.id, first.machine.id);

    const otherSite = await createSite(T, account.account.id, "Wichita");
    assert.equal("site" in otherSite, true);
    if (!("site" in otherSite)) {
      return;
    }
    const twin = await findOrCreateModelLessMachine(T, {
      name: "Fanuc R-2000",
      siteId: otherSite.site.id,
    });
    assert.equal("machine" in twin, true);
    if (!("machine" in twin)) {
      return;
    }
    assert.equal(twin.created, true);
    assert.notEqual(twin.machine.id, first.machine.id);

    const ticket = await createTicket(T, {
      machineId: first.machine.id,
      title: "Servo fault",
      customerId: "user-customer",
      customerEmail: "customer@spares.local",
      actor: {
        id: "user-customer",
        email: "customer@spares.local",
        role: "customer",
      },
    });
    assert.equal("ticket" in ticket, true);

    const quote = await createQuote(T, {
      machineId: first.machine.id,
      items: [{ id: "A06B-0115", qty: 1, name: "Servo amplifier" }],
      customerId: "user-customer",
      customerEmail: "customer@spares.local",
    });
    assert.equal("error" in quote, false);
    if ("error" in quote) {
      return;
    }
    assert.equal(quote.items[0]?.id, "A06B-0115");

    const deleted = await deleteMachine(first.machine.id, T);
    assert.equal("ok" in deleted, true);
    assert.equal(await getMachine(first.machine.id, T), null);
  });

  it("grants a machine-scoped customer the machine they just added", async () => {
    await isolatedDataDir();
    process.env.SPARES_ALLOW_SEED = "false";
    const account = await createCustomerAccount("Acme", T);
    assert.equal("account" in account, true);
    if (!("account" in account)) {
      return;
    }
    const site = await createSite(T, account.account.id, "Dayton");
    assert.equal("site" in site, true);
    if (!("site" in site)) {
      return;
    }
    const existing = await createMachine(T, {
      name: "Line A",
      siteId: site.site.id,
      storedFileName: "line-a.glb",
      originalFileName: "line-a.glb",
      parts: [],
      unmatched: [],
    });
    const person = await createCustomer(T, "tech@acme.test", "hash", {
      machineIds: [existing.id],
    });
    assert.equal("user" in person, true);
    if (!("user" in person)) {
      return;
    }
    const created = await findOrCreateModelLessMachine(T, {
      name: "Spare press",
      siteId: site.site.id,
      grantUserId: person.user.id,
    });
    assert.equal("machine" in created, true);
    if (!("machine" in created)) {
      return;
    }
    const granted = await findUserByEmail("tech@acme.test");
    assert.ok(granted);
    assert.equal(
      canAccessMachine(granted, created.machine, [site.site], [account.account]),
      true,
    );
  });
});
