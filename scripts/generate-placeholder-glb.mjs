/**
 * Builds the T1.1 placeholder palletizer/conveyor GLB.
 * Mesh and node names are part numbers so Brent's extractMeshNames join works.
 *
 * Named meshes:
 *   PN-FRAME-1000  frame weldment (joined)
 *   PN-ROLL-2104   drive rollers (joined, two meshes, same part number)
 *   PN-MTR-3301    gearmotor (joined)
 *   PN-GRD-5503    safety guard (model-only unmatched — no BOM row)
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
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
const outPath = join(
  __dirname,
  "..",
  "public",
  "placeholders",
  "palletizer-placeholder.glb",
);

function box(w, h, d, x, y, z) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
}

function cyl(rTop, rBottom, height, x, y, z, rotX = 0, rotZ = 0, segments = 24) {
  const geometry = new THREE.CylinderGeometry(
    rTop,
    rBottom,
    height,
    segments,
  );
  if (rotX) geometry.rotateX(rotX);
  if (rotZ) geometry.rotateZ(rotZ);
  geometry.translate(x, y, z);
  return geometry;
}

function merge(parts) {
  const merged = mergeGeometries(parts, false);
  if (!merged) {
    throw new Error("Failed to merge geometries");
  }
  for (const part of parts) {
    part.dispose();
  }
  return merged;
}

function namedMesh(name, geometry, color) {
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.45,
    roughness: 0.45,
    name: `${name}-mat`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

function buildFrame() {
  const legH = 0.84;
  const legY = legH / 2;
  const hx = 1.06;
  const hz = 0.4;
  const railY = 0.82;
  const parts = [
    // Box-section legs
    box(0.08, legH, 0.08, -hx, legY, -hz),
    box(0.08, legH, 0.08, hx, legY, -hz),
    box(0.08, legH, 0.08, -hx, legY, hz),
    box(0.08, legH, 0.08, hx, legY, hz),
    // Side rails (C-channel stand-ins)
    box(2.2, 0.1, 0.07, 0, railY, -0.42),
    box(2.2, 0.1, 0.07, 0, railY, 0.42),
    box(2.2, 0.04, 0.1, 0, railY - 0.07, -0.4),
    box(2.2, 0.04, 0.1, 0, railY - 0.07, 0.4),
    // End cross-members
    box(0.08, 0.1, 0.9, -1.08, railY, 0),
    box(0.08, 0.1, 0.9, 1.08, railY, 0),
    // Mid stretcher and lower tie bars
    box(0.06, 0.06, 0.84, 0, 0.18, 0),
    box(2.12, 0.05, 0.05, 0, 0.12, -0.38),
    box(2.12, 0.05, 0.05, 0, 0.12, 0.38),
    // Pillow-block bearing housings at roller ends
    box(0.14, 0.12, 0.1, -0.86, 0.86, -0.46),
    box(0.14, 0.12, 0.1, -0.86, 0.86, 0.46),
    box(0.14, 0.12, 0.1, 0.86, 0.86, -0.46),
    box(0.14, 0.12, 0.1, 0.86, 0.86, 0.46),
    // Infeed stop / discharge plate
    box(0.04, 0.16, 0.78, -1.12, 0.96, 0),
    // Small junction box on the operator side
    box(0.16, 0.14, 0.08, -0.35, 0.72, 0.48),
    // Gussets at the drive end
    box(0.16, 0.08, 0.04, 0.96, 0.55, -0.4),
    box(0.16, 0.08, 0.04, 0.96, 0.55, 0.4),
  ];
  return namedMesh("PN-FRAME-1000", merge(parts), 0x3d4450);
}

function buildRoller(x) {
  const parts = [
    cyl(0.055, 0.055, 0.78, x, 0.88, 0, Math.PI / 2, 0, 28),
    cyl(0.068, 0.068, 0.03, x, 0.88, -0.39, Math.PI / 2, 0, 24),
    cyl(0.068, 0.068, 0.03, x, 0.88, 0.39, Math.PI / 2, 0, 24),
  ];
  return namedMesh("PN-ROLL-2104", merge(parts), 0xb8c0c8);
}

function buildGearmotor() {
  const x = 0.86;
  const y = 0.88;
  const z = 0.62;
  const parts = [
    // Motor barrel
    cyl(0.11, 0.11, 0.36, x + 0.22, y, z, 0, Math.PI / 2, 28),
    // Rear fan cap
    cyl(0.118, 0.1, 0.04, x + 0.42, y, z, 0, Math.PI / 2, 24),
    // Gearbox housing at the roller
    box(0.22, 0.22, 0.2, x, y, z - 0.08),
    // Output boss toward the roller
    cyl(0.04, 0.04, 0.12, x, y, z - 0.22, Math.PI / 2, 0, 16),
    // Terminal box
    box(0.1, 0.08, 0.08, x + 0.18, y + 0.14, z),
    // Cooling fins
    box(0.28, 0.18, 0.012, x + 0.22, y, z + 0.12),
    box(0.28, 0.18, 0.012, x + 0.22, y, z + 0.145),
    box(0.28, 0.18, 0.012, x + 0.22, y, z - 0.01),
    // Foot / adapter plate
    box(0.2, 0.04, 0.16, x, y - 0.14, z - 0.02),
  ];
  return namedMesh("PN-MTR-3301", merge(parts), 0xe67e22);
}

function buildGuard() {
  const parts = [
    // Hood rails
    box(0.52, 0.03, 0.03, 0.92, 1.18, -0.46),
    box(0.52, 0.03, 0.03, 0.92, 1.18, 0.46),
    box(0.03, 0.03, 0.95, 0.67, 1.18, 0),
    box(0.03, 0.03, 0.95, 1.17, 1.18, 0),
    // Posts
    box(0.03, 0.32, 0.03, 0.67, 1.01, -0.46),
    box(0.03, 0.32, 0.03, 1.17, 1.01, -0.46),
    box(0.03, 0.32, 0.03, 0.67, 1.01, 0.46),
    box(0.03, 0.32, 0.03, 1.17, 1.01, 0.46),
    // Slats — reads as a cage, not a solid cube
    box(0.48, 0.012, 0.04, 0.92, 1.18, -0.28),
    box(0.48, 0.012, 0.04, 0.92, 1.18, -0.1),
    box(0.48, 0.012, 0.04, 0.92, 1.18, 0.1),
    box(0.48, 0.012, 0.04, 0.92, 1.18, 0.28),
    // Drive-end face slats
    box(0.012, 0.28, 0.04, 1.18, 1.02, -0.28),
    box(0.012, 0.28, 0.04, 1.18, 1.02, -0.1),
    box(0.012, 0.28, 0.04, 1.18, 1.02, 0.1),
    box(0.012, 0.28, 0.04, 1.18, 1.02, 0.28),
  ];
  return namedMesh("PN-GRD-5503", merge(parts), 0xf1c40f);
}

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

const scene = new THREE.Scene();
scene.add(buildFrame());
scene.add(buildRoller(-0.86));
scene.add(buildRoller(0.86));
scene.add(buildGearmotor());
scene.add(buildGuard());

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(scene, { binary: true });
const bytes = result instanceof ArrayBuffer ? new Uint8Array(result) : result;

writeFileSync(outPath, bytes);

const names = extractMeshNames(bytes);
const expected = [
  "PN-FRAME-1000",
  "PN-ROLL-2104",
  "PN-MTR-3301",
  "PN-GRD-5503",
];
const missing = expected.filter((name) => !names.includes(name));
if (missing.length > 0) {
  throw new Error(
    `Placeholder GLB missing expected names: ${missing.join(", ")} (got ${names.join(", ")})`,
  );
}

console.log(`Wrote ${outPath} (${bytes.byteLength} bytes)`);
console.log(`extractMeshNames: ${names.join(", ")}`);
