import { copyFile, readFile } from "node:fs/promises";
import path from "path";
import { extractMeshNames } from "@/lib/gltf";
import { joinParts, parsePartsList } from "@/lib/parts";
import type { Part, UnmatchedPart } from "@/types";

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

const FIXTURES: FixtureSpec[] = [
  {
    id: FIXTURE_MACHINE_IDS.hardware,
    name: "Hardware fixture",
    modelRel: "placeholders/hardware/mcmaster-hardware.glb",
    listRel: "placeholders/hardware/mcmaster-hardware-parts.json",
    originalFileName: "mcmaster-hardware.glb",
  },
  {
    id: FIXTURE_MACHINE_IDS.palletizer,
    name: "Palletizer",
    modelRel: "placeholders/palletizer-placeholder.glb",
    listRel: "placeholders/palletizer-parts.json",
    originalFileName: "palletizer-placeholder.glb",
  },
];

async function readPublicBytes(rel: string): Promise<Buffer> {
  const candidates = [
    path.join(process.cwd(), "public", rel),
    path.join(process.cwd(), ".next", "standalone", "public", rel),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      // try the next location or a same-origin fetch on Vercel
    }
  }

  const host = process.env.VERCEL_URL;
  if (host) {
    const response = await fetch(`https://${host}/${rel}`);
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
  await copyFile(
    path.join(process.cwd(), "public", spec.modelRel),
    destPath,
  ).catch(async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(destPath, modelBytes);
  });

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
    created.push(
      await buildFixtureMachine(spec, path.join(filesDirPath, storedFileName)),
    );
  }

  return created;
}
