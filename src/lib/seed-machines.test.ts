import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  SEED_HARDWARE_MACHINE_NAME,
  SEED_PALLETIZER_MACHINE_NAME,
  ensureSeededMachines,
  loadSeedPack,
  seedPacks,
} from "./seed-machines.ts";

describe("ensureSeededMachines", () => {
  it("empty store gets two seeded machines", async () => {
    const filesDirectory = await mkdtemp(path.join(tmpdir(), "spares-files-"));
    try {
      const first = await ensureSeededMachines([], filesDirectory);
      assert.deepEqual(
        first.map((machine) => machine.name),
        [SEED_HARDWARE_MACHINE_NAME, SEED_PALLETIZER_MACHINE_NAME],
      );

      const hardware = first.find((machine) => machine.name === SEED_HARDWARE_MACHINE_NAME);
      const palletizer = first.find(
        (machine) => machine.name === SEED_PALLETIZER_MACHINE_NAME,
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

      const copied = await readFile(path.join(filesDirectory, hardware.storedFileName));
      const source = await readFile(seedPacks()[0]!.modelPath);
      assert.deepEqual(copied, source);

      const second = await ensureSeededMachines(first, filesDirectory);
      assert.equal(second, first);
      assert.equal(second.length, 2);
    } finally {
      await rm(filesDirectory, { recursive: true, force: true });
    }
  });

  it("joins sample packs with the same unmatched rows as staff upload", async () => {
    const [hardwarePack, palletizerPack] = seedPacks();
    const hardware = await loadSeedPack(hardwarePack!);
    const palletizer = await loadSeedPack(palletizerPack!);

    assert.ok(hardware.parts.some((part) => part.id === "91280A340" && part.qty === 4));
    assert.ok(
      hardware.unmatched.some((row) => row.source === "list" && row.id === "93475A240"),
    );
    assert.ok(palletizer.parts.some((part) => part.id === "PN-ROLL-2104" && part.qty === 2));
    assert.ok(
      palletizer.unmatched.some((row) => row.source === "list" && row.id === "PN-BELT-4402"),
    );
    assert.ok(
      palletizer.unmatched.some(
        (row) => row.source === "model" && row.meshName === "PN-GRD-5503",
      ),
    );
  });
});
