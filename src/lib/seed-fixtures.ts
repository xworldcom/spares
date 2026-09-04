import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "path";
import { extractMeshNames } from "./gltf.ts";
import { joinParts, parsePartsList } from "./parts.ts";
import type { Part, UnmatchedPart } from "../types/index.ts";

type FixtureMachine = {
  id: string;
  name: string;
  storedFileName: string;
  originalFileName: string;
  parts: Part[];
  unmatched: UnmatchedPart[];
  createdAt: string;
};

export const FIXTURE_MACHINE_IDS = {
  hardware: "hardware-fixture",
  palletizer: "palletizer",
} as const;

type FixtureSpec = {
  id: string;
  name: string;
  modelRel: string;
  listRel: string;
  originalFileName: string;
};

function placeholderRoots(): string[] {
  const roots = [path.join(process.cwd(), "public", "placeholders")];
  try {
    roots.push(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "public",
        "placeholders",
      ),
    );
  } catch {
    // Bundled CJS has no import.meta.url.
  }
  return [...new Set(roots)];
}

const FIXTURES: FixtureSpec[] = [
  {
    id: FIXTURE_MACHINE_IDS.hardware,
    name: "Hardware fixture",
    modelRel: "hardware/mcmaster-hardware.glb",
    listRel: "hardware/mcmaster-hardware-parts.json",
    originalFileName: "mcmaster-hardware.glb",
  },
  {
    id: FIXTURE_MACHINE_IDS.palletizer,
    name: "Palletizer",
    modelRel: "palletizer-placeholder.glb",
    listRel: "palletizer-parts.json",
    originalFileName: "palletizer-placeholder.glb",
  },
];

async function readPublicBytes(rel: string): Promise<Buffer> {
  for (const root of placeholderRoots()) {
    try {
      return await readFile(path.join(root, rel));
    } catch {
      // Try the next root (cwd vs bundled path vs Vercel fetch).
    }
  }
  const host = process.env.VERCEL_URL;
  if (host) {
    const response = await fetch(`https://${host}/placeholders/${rel}`);
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }
  }
  throw new Error(`Could not read fixture ${rel}`);
}

export async function buildFixtureMachine(
  spec: FixtureSpec,
  destPath: string,
): Promise<FixtureMachine> {
  const modelBytes = await readPublicBytes(spec.modelRel);
  const listText = (await readPublicBytes(spec.listRel)).toString("utf8");
  const rows = parsePartsList(listText, spec.listRel);
  const meshNames = extractMeshNames(modelBytes, spec.originalFileName);
  const { parts, unmatched } = joinParts(rows, meshNames);
  await writeFile(destPath, modelBytes);

  return {
    id: spec.id,
    name: spec.name,
    storedFileName: path.basename(destPath),
    originalFileName: spec.originalFileName,
    parts,
    unmatched,
    createdAt: new Date().toISOString(),
  };
}

export async function missingFixtureMachines(
  existing: FixtureMachine[],
  filesDirPath: string,
): Promise<FixtureMachine[]> {
  const have = new Set(existing.map((machine) => machine.id));
  const alsoByName = new Set(existing.map((machine) => machine.name));
  const created: FixtureMachine[] = [];

  for (const spec of FIXTURES) {
    if (have.has(spec.id) || alsoByName.has(spec.name)) {
      continue;
    }
    const storedFileName = `${spec.id}.glb`;
    try {
      created.push(
        await buildFixtureMachine(spec, path.join(filesDirPath, storedFileName)),
      );
      have.add(spec.id);
      alsoByName.add(spec.name);
    } catch (cause) {
      console.error(`[spares] fixture ${spec.id} failed`, cause);
    }
  }

  return created;
}
