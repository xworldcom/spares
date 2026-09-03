import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { toMachineDetail } from "./machines.ts";
import {
  SEED_HARDWARE_MACHINE_NAME,
  SEED_PALLETIZER_MACHINE_NAME,
} from "./seed-machines.ts";
import {
  createMachine,
  filesDir,
  findUserByEmail,
  getMachine,
  listMachines,
  resetStoreForTests,
  SEED_CUSTOMER,
  SEED_STAFF,
} from "./store.ts";

const SEEDED_NAMES = [SEED_HARDWARE_MACHINE_NAME, SEED_PALLETIZER_MACHINE_NAME];

async function withEmptyStore(run: (dataDir: string) => Promise<void>) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "spares-store-"));
  const previous = process.env.SPARES_DATA_DIR;
  process.env.SPARES_DATA_DIR = dataDir;
  resetStoreForTests();
  try {
    await run(dataDir);
  } finally {
    resetStoreForTests();
    if (previous === undefined) {
      delete process.env.SPARES_DATA_DIR;
    } else {
      process.env.SPARES_DATA_DIR = previous;
    }
    await rm(dataDir, { recursive: true, force: true });
  }
}

describe("empty store seed machines", () => {
  afterEach(() => {
    resetStoreForTests();
  });

  it("empty store gets two seeded machines", async () => {
    await withEmptyStore(async (dataDir) => {
      const listed = await listMachines();
      assert.deepEqual(
        listed.map((machine) => machine.name).sort(),
        [...SEEDED_NAMES].sort(),
      );

      const staff = await findUserByEmail(SEED_STAFF.email);
      const customer = await findUserByEmail(SEED_CUSTOMER.email);
      assert.equal(staff?.role, "staff");
      assert.equal(customer?.role, "customer");
      assert.equal(SEED_STAFF.email, "staff@spares.local");
      assert.equal(SEED_CUSTOMER.email, "customer@spares.local");

      const hardware = await getMachine(
        listed.find((machine) => machine.name === SEED_HARDWARE_MACHINE_NAME)!.id,
      );
      const palletizer = await getMachine(
        listed.find((machine) => machine.name === SEED_PALLETIZER_MACHINE_NAME)!.id,
      );
      assert.ok(hardware);
      assert.ok(palletizer);

      assert.ok(
        hardware.unmatched.some((row) => row.source === "list" && row.id === "93475A240"),
      );
      assert.ok(
        palletizer.unmatched.some(
          (row) => row.source === "list" && row.id === "PN-BELT-4402",
        ),
      );

      const customerHardware = toMachineDetail(hardware, "https://example.test/h", "customer");
      const staffHardware = toMachineDetail(hardware, "https://example.test/h", "staff");
      assert.equal(Object.hasOwn(customerHardware, "unmatched"), false);
      assert.ok(staffHardware.unmatched?.some((row) => row.id === "93475A240"));

      const hardwareBytes = await readFile(
        path.join(filesDir(), hardware.storedFileName),
      );
      const sourceBytes = await readFile(
        "public/placeholders/hardware/mcmaster-hardware.glb",
      );
      assert.deepEqual(hardwareBytes, sourceBytes);

      const db = JSON.parse(await readFile(path.join(dataDir, "db.json"), "utf8")) as {
        machines: { name: string }[];
      };
      assert.equal(db.machines.length, 2);

      resetStoreForTests();
      const again = await listMachines();
      assert.deepEqual(
        again.map((machine) => machine.name).sort(),
        [...SEEDED_NAMES].sort(),
      );
      assert.deepEqual(
        again.map((machine) => machine.id).sort(),
        listed.map((machine) => machine.id).sort(),
      );
    });
  });

  it("seeds machines into an existing user-only store without duplicating", async () => {
    await withEmptyStore(async (dataDir) => {
      await writeFile(
        path.join(dataDir, "db.json"),
        JSON.stringify(
          {
            users: [
              {
                id: "user-staff",
                email: SEED_STAFF.email,
                passwordHash: "x",
                role: "staff",
              },
            ],
            machines: [],
            quotes: [],
          },
          null,
          2,
        ),
      );

      const listed = await listMachines();
      assert.deepEqual(
        listed.map((machine) => machine.name).sort(),
        [...SEEDED_NAMES].sort(),
      );

      await createMachine({
        name: "Staff uploaded press",
        storedFileName: "press.glb",
        originalFileName: "press.glb",
        parts: [{ id: "PN-1", name: "Pump", meshName: "PN-1", qty: 1 }],
        unmatched: [],
      });

      resetStoreForTests();
      const afterUpload = await listMachines();
      assert.equal(afterUpload.length, 3);
      assert.ok(afterUpload.some((machine) => machine.name === "Staff uploaded press"));
      assert.equal(
        afterUpload.filter((machine) => SEEDED_NAMES.includes(machine.name)).length,
        2,
      );
    });
  });
});
