import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Part, UnmatchedPart } from "../types/index.ts";
import { extractMeshNames } from "./gltf.ts";
import { joinParts, parsePartsList } from "./parts.ts";

export type SeededMachine = {
  id: string;
  name: string;
  storedFileName: string;
  originalFileName: string;
  parts: Part[];
  unmatched: UnmatchedPart[];
  createdAt: string;
};

export const SEED_HARDWARE_MACHINE_NAME = "Hardware fixture (McMaster)";
export const SEED_PALLETIZER_MACHINE_NAME = "Palletizer (placeholder)";

export type SeedPack = {
  name: string;
  modelPath: string;
  partsPath: string;
};

export function seedPacks(root = process.cwd()): SeedPack[] {
  return [
    {
      name: SEED_HARDWARE_MACHINE_NAME,
      modelPath: path.join(
        root,
        "public/placeholders/hardware/mcmaster-hardware.glb",
      ),
      partsPath: path.join(
        root,
        "public/placeholders/hardware/mcmaster-hardware-parts.json",
      ),
    },
    {
      name: SEED_PALLETIZER_MACHINE_NAME,
      modelPath: path.join(
        root,
        "public/placeholders/palletizer-placeholder.glb",
      ),
      partsPath: path.join(root, "public/placeholders/palletizer-parts.json"),
    },
  ];
}

export async function loadSeedPack(pack: SeedPack) {
  const bytes = await readFile(pack.modelPath);
  const listText = await readFile(pack.partsPath, "utf8");
  const originalFileName = path.basename(pack.modelPath);
  const meshNames = extractMeshNames(bytes, originalFileName);
  const rows = parsePartsList(listText, path.basename(pack.partsPath));
  const { parts, unmatched } = joinParts(rows, meshNames);
  return { name: pack.name, originalFileName, bytes, parts, unmatched };
}

/**
 * Copy each sample pack into the store files dir and append machine rows.
 * Skips a pack when a machine with that name already exists.
 */
export async function ensureSeededMachines(
  existing: SeededMachine[],
  filesDirectory: string,
): Promise<SeededMachine[]> {
  await mkdir(filesDirectory, { recursive: true });

  const missing = seedPacks().filter(
    (pack) => !existing.some((machine) => machine.name === pack.name),
  );
  if (missing.length === 0) {
    return existing;
  }

  const machines = [...existing];
  for (const pack of missing) {
    const loaded = await loadSeedPack(pack);
    const storedFileName = `${randomUUID()}.glb`;
    await writeFile(path.join(filesDirectory, storedFileName), loaded.bytes);

    machines.push({
      id: randomUUID(),
      name: loaded.name,
      storedFileName,
      originalFileName: loaded.originalFileName,
      parts: loaded.parts,
      unmatched: loaded.unmatched,
      createdAt: new Date().toISOString(),
    });
  }

  return machines;
}
