/**
 * Builds the second staff-upload fixture pack: real public CAD hardware.
 *
 * Mesh and node names are McMaster-Carr catalog numbers so Brent's
 * extractMeshNames join works (src/lib/gltf.ts). Geometry is public
 * STEP/GLB (step.parts, MIT), not McMaster's login-gated CAD and not
 * Kevin's machine. See public/placeholders/hardware/SOURCES.md.
 *
 * Named meshes:
 *   5972K325   608ZZ-size shielded ball bearing (joined)
 *   91280A340  ISO 4017 M6x25 hex head cap screw (joined)
 *   91828A230  ISO 4032 M6 hex nut (joined)
 *   6435K12    8 mm set-screw shaft collar (joined)
 *   6331K32    canned DC hobby motor (joined; Adafruit 711 geometry)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    result = null;
    onloadend = null;

    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = buffer;
          this.onloadend?.();
        })
        .catch((error) => {
          throw error;
        });
    }
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const cadDir = join(__dirname, "hardware-cad");
const outPath = join(
  __dirname,
  "..",
  "public",
  "placeholders",
  "hardware",
  "mcmaster-hardware.glb",
);

/** mm → viewer units so Bounds + camera near/far (0.1 / 50) match the palletizer pack. */
const MM_TO_VIEWER = 0.01;

const PARTS = [
  {
    catalog: "5972K325",
    file: "bearing_608zz.glb",
    color: 0xc5ccd3,
    x: -0.9,
  },
  {
    catalog: "91280A340",
    file: "iso4017_hex_head_cap_screw_m6x25.glb",
    color: 0x7a828c,
    x: -0.45,
  },
  {
    catalog: "91828A230",
    file: "iso4032_hex_nut_m6.glb",
    color: 0xd8dde3,
    x: 0,
  },
  {
    catalog: "6435K12",
    file: "shaft_collar_set_screw_8mm.glb",
    color: 0x2b2b2b,
    x: 0.45,
  },
  {
    catalog: "6331K32",
    file: "adafruit_711_dc_toy_motor.glb",
    color: 0xc4a035,
    x: 0.95,
  },
];

function extractMeshNames(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("Not a GLB file");
  }
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkType === 0x4e4f534a) {
      const json = JSON.parse(
        new TextDecoder().decode(bytes.subarray(offset, offset + chunkLength)),
      );
      const names = new Set();
      for (const node of json.nodes ?? []) {
        if (node.mesh === undefined) continue;
        const name = node.name?.trim();
        if (name) names.add(name);
      }
      for (const mesh of json.meshes ?? []) {
        const name = mesh.name?.trim();
        if (name) names.add(name);
      }
      return [...names];
    }
    offset += chunkLength;
  }
  throw new Error("GLB missing JSON chunk");
}

function mergeWorldGeometries(root) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((object) => {
    if (!object.isMesh) {
      return;
    }
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    parts.push(geometry);
  });
  if (parts.length === 0) {
    throw new Error("Source GLB has no meshes");
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  if (!merged) {
    throw new Error("Failed to merge source meshes");
  }
  return merged;
}

async function loadNamedMesh(part) {
  const bytes = readFileSync(join(cadDir, part.file));
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  const geometry = mergeWorldGeometries(gltf.scene);
  // Source CAD is Z-up (mm). Viewer / palletizer pack is Y-up.
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(MM_TO_VIEWER, MM_TO_VIEWER, MM_TO_VIEWER);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const x = -(box.min.x + box.max.x) / 2;
  const y = -box.min.y;
  const z = -(box.min.z + box.max.z) / 2;
  geometry.translate(x + part.x, y, z);

  const material = new THREE.MeshStandardMaterial({
    color: part.color,
    metalness: 0.65,
    roughness: 0.35,
    name: `${part.catalog}-mat`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = part.catalog;
  return mesh;
}

const scene = new THREE.Scene();
for (const part of PARTS) {
  scene.add(await loadNamedMesh(part));
}

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(scene, { binary: true });
const bytes = result instanceof ArrayBuffer ? new Uint8Array(result) : result;

writeFileSync(outPath, bytes);

const names = extractMeshNames(bytes);
const expected = PARTS.map((part) => part.catalog);
const missing = expected.filter((name) => !names.includes(name));
if (missing.length > 0) {
  throw new Error(
    `Hardware GLB missing expected names: ${missing.join(", ")} (got ${names.join(", ")})`,
  );
}
const extras = names.filter((name) => !expected.includes(name));
if (extras.length > 0) {
  throw new Error(
    `Hardware GLB has unexpected names: ${extras.join(", ")} (got ${names.join(", ")})`,
  );
}

console.log(`Wrote ${outPath} (${bytes.byteLength} bytes)`);
console.log(`extractMeshNames: ${names.join(", ")}`);
