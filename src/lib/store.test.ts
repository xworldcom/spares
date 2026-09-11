import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
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
  createMachine,
  createManual,
  createQuote,
  createTicket,
  deleteMachine,
  getMachine,
  getMachineUsage,
  getQuote,
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

    const machines = await listMachines();
    const ids = machines.map((machine) => machine.id).sort();
    assert.deepEqual(ids, [
      FIXTURE_MACHINE_IDS.hardware,
      FIXTURE_MACHINE_IDS.palletizer,
    ].sort());
  });

  it("re-seeds when in-memory catalog is warm and empty", async () => {
    await isolatedDataDir();
    seedEmptyMachineCatalogForTests(seedUsers);

    const machines = await listMachines();
    assert.ok(machines.some((machine) => machine.id === FIXTURE_MACHINE_IDS.hardware));
    assert.ok(machines.some((machine) => machine.id === FIXTURE_MACHINE_IDS.palletizer));
  });

  it("heal=true drops memory and rebuilds fixtures", async () => {
    await isolatedDataDir();
    seedEmptyMachineCatalogForTests(seedUsers);

    const machines = await listMachines({ heal: true });
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
    await listMachines();

    const quote = await createQuote({
      machineId: FIXTURE_MACHINE_IDS.hardware,
      items: [{ id: "5972K325", qty: 1, name: "Bearing" }],
      customerId: "user-customer",
      customerEmail: "customer@spares.local",
    });
    await appendQuoteActivity(
      quote.id,
      { id: "user-staff", email: "staff@spares.local", role: "staff" },
      "message",
      "Checking lead time.",
    );
    await saveMachineFile(`po-${quote.id}.pdf`, Buffer.from("%PDF-1.4 hop"));

    resetStoreMemoryForTests();

    const again = await getQuote(quote.id);
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

    await listMachines();
    const quote = await createQuote({
      machineId: FIXTURE_MACHINE_IDS.palletizer,
      items: [{ id: "PN-FRAME-1000", qty: 2, name: "Frame" }],
      customerId: "user-customer",
      customerEmail: "customer@spares.local",
    });
    await appendQuoteActivity(
      quote.id,
      { id: "user-customer", email: "customer@spares.local", role: "customer" },
      "message",
      "Need this on Friday.",
    );
    await saveMachineFile("po-remote.pdf", Buffer.from("PO bytes"));

    seedEmptyMachineCatalogForTests(seedUsers);
    const poisoned = await getQuote(quote.id);
    assert.equal(poisoned?.id, quote.id);

    resetStoreMemoryForTests();

    const machines = await listMachines();
    assert.ok(machines.some((machine) => machine.id === FIXTURE_MACHINE_IDS.hardware));
    const again = await getQuote(quote.id);
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

    const created = await createMachine({
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

    const updated = await updateMachine(created.id, {
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
    const again = await getMachine(created.id);
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
  });

  it("persists manuals, tickets, and usage across a memory reset", async () => {
    await isolatedDataDir();
    const created = await createMachine({
      name: "Care cell",
      storedFileName: "care-cell.glb",
      originalFileName: "care-cell.glb",
      parts: [{ id: "PN-1", name: "Frame", meshName: "PN-1", qty: 1 }],
      unmatched: [],
    });

    const manual = await createManual({
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

    const ticket = await createTicket({
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
    await updateTicketStatus(ticket.ticket.id, "in_progress", {
      id: "user-staff",
      email: "staff@spares.local",
      role: "staff",
    });
    await appendTicketActivity(ticket.ticket.id, {
      id: "user-staff",
      email: "staff@spares.local",
      role: "staff",
    }, "On site Friday.");

    const usage = await updateMachineUsage(
      created.id,
      { hours: 1240, cycles: 88000, lastServiceAt: "2026-09-01", notes: "Greased rails" },
      "staff@spares.local",
    );
    assert.equal("error" in usage, false);

    resetStoreMemoryForTests();

    const manuals = await listManuals(created.id);
    assert.equal(manuals[0]?.title, "Operator guide");
    assert.equal((await readStoredFile("operator-guide.pdf")).toString(), "%PDF-1.4 care");

    const tickets = await listTickets(created.id);
    assert.equal(tickets[0]?.status, "in_progress");
    assert.equal(tickets[0]?.activities.at(-1)?.text, "On site Friday.");

    const again = await getMachineUsage(created.id);
    assert.equal(again?.hours, 1240);
    assert.equal(again?.history[0]?.summary.includes("hours"), true);

    await deleteMachine(created.id);
    resetStoreMemoryForTests();
    assert.equal((await listManuals(created.id)).length, 0);
    assert.equal((await listTickets(created.id)).length, 0);
    assert.equal(await getMachineUsage(created.id), null);
  });
});
