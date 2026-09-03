const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

type GltfNode = {
  name?: string;
  mesh?: number;
};

type GltfMesh = {
  name?: string;
};

type GltfRoot = {
  nodes?: GltfNode[];
  meshes?: GltfMesh[];
};

function parseGlbJson(bytes: Buffer): unknown {
  if (bytes.length < 12) {
    throw new Error("GLB too short");
  }
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("Not a GLB file");
  }
  if (bytes.readUInt32LE(4) !== 2) {
    throw new Error("Unsupported GLB version");
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + chunkLength > bytes.length) {
      throw new Error("GLB chunk truncated");
    }
    if (chunkType === JSON_CHUNK) {
      return JSON.parse(bytes.subarray(offset, offset + chunkLength).toString("utf8"));
    }
    offset += chunkLength;
  }

  throw new Error("GLB missing JSON chunk");
}

function namesFromGltf(json: unknown): string[] {
  if (!json || typeof json !== "object") {
    return [];
  }

  const root = json as GltfRoot;
  const names = new Set<string>();

  for (const node of root.nodes ?? []) {
    if (node.mesh === undefined) {
      continue;
    }
    const name = node.name?.trim();
    if (name) {
      names.add(name);
    }
  }

  for (const mesh of root.meshes ?? []) {
    const name = mesh.name?.trim();
    if (name) {
      names.add(name);
    }
  }

  return [...names];
}

export function extractMeshNames(bytes: Buffer, filename: string): string[] {
  const lower = filename.toLowerCase();
  const json = lower.endsWith(".gltf")
    ? JSON.parse(bytes.toString("utf8"))
    : parseGlbJson(bytes);
  return namesFromGltf(json);
}
