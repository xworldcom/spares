/**
 * Rebuilds the public 3-DOF arm pack from SolidWorks → URDF STLs.
 *
 * Source assembly (MIT, Stephen Brawner / ros/solidworks_urdf_exporter):
 *   3_DOF_ARM.SLDASM + BASE / SEGMENT / END_EFFECTOR .SLDPRT
 * Those binaries are not tessellated CAD we can read on Linux. The
 * exporter already wrote one STL per SW component. This script parents
 * them with the URDF joint origins so the GLB is an assembled machine.
 *
 * Node names are the SolidWorks component part numbers.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

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
const cadDir = join(__dirname, "arm-cad");
const outDir = join(__dirname, "..", "public", "placeholders", "arm");
const SCALE = 8;

const PARTS = [
  {
    partNumber: "3_DOF_ARM_BASE",
    name: "Arm base",
    file: "base_link.STL",
    parent: null,
    origin: [0, 0, 0],
    rpy: [0, 0, 0],
    color: 0xb8c0cc,
    qty: 1,
  },
  {
    partNumber: "3_DOF_ARM_SEGMENT",
    name: "Proximal arm segment",
    file: "prox_link.STL",
    parent: "3_DOF_ARM_BASE",
    origin: [0.00249115384615384, 0, 0],
    rpy: [-Math.PI / 2, 0, -Math.PI / 2],
    color: 0x8f99a6,
    qty: 1,
    meshName: "3_DOF_ARM_SEGMENT-1",
  },
  {
    partNumber: "3_DOF_ARM_SEGMENT_DIST",
    name: "Distal arm segment",
    file: "dist_Link.STL",
    parent: "3_DOF_ARM_SEGMENT",
    origin: [0, -0.18920972027972, 0],
    rpy: [-Math.PI / 2, 0, 0],
    color: 0x6e7884,
    qty: 1,
    catalog: "3_DOF_ARM_SEGMENT",
    meshName: "3_DOF_ARM_SEGMENT-2",
  },
  {
    partNumber: "3_DOF_ARM_END_EFFECTOR",
    name: "End effector",
    file: "effector_link.STL",
    parent: "3_DOF_ARM_SEGMENT_DIST",
    origin: [0, -0.18, 0],
    rpy: [Math.PI / 2, 0, 0],
    color: 0xd2d7de,
    qty: 1,
  },
];

function loadStl(file) {
  const loader = new STLLoader();
  const buf = readFileSync(join(cadDir, file));
  const geom = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  geom.computeVertexNormals();
  return geom;
}

const scene = new THREE.Scene();
const nodes = new Map();

for (const part of PARTS) {
  const geom = loadStl(part.file);
  const material = new THREE.MeshStandardMaterial({
    color: part.color,
    metalness: 0.18,
    roughness: 0.55,
  });
  const mesh = new THREE.Mesh(geom, material);
  const label = part.meshName ?? part.partNumber;
  mesh.name = label;
  const group = new THREE.Group();
  group.name = label;
  group.add(mesh);
  group.position.set(part.origin[0] * SCALE, part.origin[1] * SCALE, part.origin[2] * SCALE);
  group.rotation.set(part.rpy[0], part.rpy[1], part.rpy[2], "ZYX");
  nodes.set(part.partNumber, group);
  const parent = part.parent ? nodes.get(part.parent) : scene;
  parent.add(group);
}

const exporter = new GLTFExporter();
const glb = await new Promise((resolve, reject) => {
  exporter.parse(
    scene,
    (result) => resolve(Buffer.from(result)),
    reject,
    { binary: true },
  );
});
writeFileSync(join(outDir, "3-dof-arm.glb"), glb);

const csv = [
  "partNumber,name,meshName,qty",
  "3_DOF_ARM_BASE,Arm base,3_DOF_ARM_BASE,1",
  "3_DOF_ARM_SEGMENT,Arm segment,3_DOF_ARM_SEGMENT,2",
  "3_DOF_ARM_END_EFFECTOR,End effector,3_DOF_ARM_END_EFFECTOR,1",
].join("\n");
writeFileSync(join(outDir, "3-dof-arm-parts.csv"), `${csv}\n`);
writeFileSync(
  join(outDir, "3-dof-arm-parts.json"),
  `${JSON.stringify(
    [
      { partNumber: "3_DOF_ARM_BASE", name: "Arm base", meshName: "3_DOF_ARM_BASE", qty: 1 },
      { partNumber: "3_DOF_ARM_SEGMENT", name: "Arm segment", meshName: "3_DOF_ARM_SEGMENT", qty: 2 },
      { partNumber: "3_DOF_ARM_END_EFFECTOR", name: "End effector", meshName: "3_DOF_ARM_END_EFFECTOR", qty: 1 },
    ],
    null,
    2,
  )}\n`,
);
console.log(`wrote ${glb.length} bytes ${join(outDir, "3-dof-arm.glb")}`);
