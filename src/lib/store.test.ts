import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  FIXTURE_MACHINE_IDS,
} from "./seed-fixtures.ts";
import {
  listMachines,
  resetStoreMemoryForTests,
  seedEmptyMachineCatalogForTests,
} from "./store.ts";

async function isolatedDataDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "spares-store-"));
  process.env.SPARES_DATA_DIR = dir;
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
