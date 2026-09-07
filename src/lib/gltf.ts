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

export function isGlb(bytes: Buffer) {
  return bytes.length >= 12 && bytes.readUInt32LE(0) === GLB_MAGIC;
}

function isPadByte(value: number) {
  return (
    value === 0x00 ||
    value === 0x20 ||
    value === 0x09 ||
    value === 0x0a ||
    value === 0x0d
  );
}

/**
 * SolidWorks and other exporters often pad the GLB JSON chunk with 0x00,
 * or declare a chunk length that runs into the BIN payload. JSON.parse of
 * that whole slice throws "Unexpected non-whitespace character after JSON".
 * Take only the first complete JSON value.
 */
function endOfJsonValue(bytes: Buffer, start: number) {
  const first = bytes[start];
  if (first !== 0x7b && first !== 0x5b) {
    let end = bytes.length;
    while (end > start && isPadByte(bytes[end - 1] ?? 0)) {
      end -= 1;
    }
    return end;
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < bytes.length; i += 1) {
    const char = bytes[i] ?? 0;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === 0x5c) {
        escape = true;
        continue;
      }
      if (char === 0x22) {
        inString = false;
      }
      continue;
    }
    if (char === 0x22) {
      inString = true;
      continue;
    }
    if (char === 0x7b || char === 0x5b) {
      depth += 1;
    } else if (char === 0x7d || char === 0x5d) {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  throw new Error("GLB JSON chunk truncated");
}

function parseLeadingJson(bytes: Buffer): unknown {
  let start = 0;
  while (start < bytes.length && isPadByte(bytes[start] ?? 0)) {
    start += 1;
  }
  if (start >= bytes.length) {
    throw new Error("GLB JSON chunk is empty");
  }
  const end = endOfJsonValue(bytes, start);
  return JSON.parse(bytes.subarray(start, end).toString("utf8"));
}

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
      return parseLeadingJson(bytes.subarray(offset, offset + chunkLength));
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
  // Detect by magic, not the filename. A .gltf name on a GLB (or the reverse)
  // must not JSON.parse the full binary as UTF-8.
  if (isGlb(bytes)) {
    return namesFromGltf(parseGlbJson(bytes));
  }
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".gltf") && !lower.endsWith(".glb")) {
    throw new Error("Model must be a .glb or .gltf file");
  }
  return namesFromGltf(JSON.parse(bytes.toString("utf8")));
}
