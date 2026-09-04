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
  createQuote,
  getQuote,
  listMachines,
  readStoredFile,
  resetStoreMemoryForTests,
  saveMachineFile,
  seedEmptyMachineCatalogForTests,
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
