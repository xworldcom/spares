import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Vector3,
  type Intersection,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { pickNearest } from "./pickHit.ts";
import { buildPartIndex } from "./resolvePick.ts";
import type { ViewerPart } from "./types.ts";

const GLB = fileURLToPath(
  new URL("../../../public/placeholders/palletizer-placeholder.glb", import.meta.url),
);

const PARTS: ViewerPart[] = [
  { id: "PN-FRAME-1000", name: "Frame weldment", meshName: "PN-FRAME-1000", qty: 1 },
  { id: "PN-ROLL-2104", name: "Drive roller", meshName: "PN-ROLL-2104", qty: 2 },
  { id: "PN-MTR-3301", name: "Gearmotor", meshName: "PN-MTR-3301", qty: 1 },
];

async function loadScene() {
  const bytes = readFileSync(GLB);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  gltf.scene.updateMatrixWorld(true);
  return gltf.scene;
}

function castFromViewer(scene: Object3D, target: Vector3) {
  const camera = new PerspectiveCamera(40, 1.6, 0.05, 8000);
  camera.position.set(2.8, 1.9, 2.5);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const raycaster = new Raycaster();
  const direction = target.clone().sub(camera.position).normalize();
  raycaster.set(camera.position, direction);
  return raycaster.intersectObject(scene, true);
}

function partIdOf(hit: ReturnType<typeof pickNearest>) {
  return hit && "part" in hit ? hit.part.id : null;
}

describe("pickNearest on the palletizer GLB", () => {
  it("picks the gearmotor when the ray also hits the frame behind it", async () => {
    const scene = await loadScene();
    const hits = castFromViewer(scene, new Vector3(1.08, 0.88, 0.62));
    const names = hits.map((hit) => hit.object.name);
    assert.ok(names.includes("PN-MTR-3301"), `ray should hit the motor, got ${names.join(",")}`);
    assert.ok(
      names.includes("PN-FRAME-1000"),
      `ray should also hit the frame behind it, got ${names.join(",")}`,
    );
    const index = buildPartIndex(PARTS);
    assert.equal(partIdOf(pickNearest(hits, index)), "PN-MTR-3301");
    const lastWins = pickNearest([hits[hits.length - 1] as Intersection], index);
    assert.equal(partIdOf(lastWins), "PN-FRAME-1000", "farthest hit is the frame (old behaviour)");
  });

  it("picks the roller in front of the frame", async () => {
    const scene = await loadScene();
    const hits = castFromViewer(scene, new Vector3(0.86, 0.88, 0.2));
    const index = buildPartIndex(PARTS);
    assert.ok(hits[0]?.object.name.startsWith("PN-ROLL-2104"), hits[0]?.object.name);
    assert.equal(partIdOf(pickNearest(hits, index)), "PN-ROLL-2104");
  });

  it("falls through to the frame when it is the nearest surface", async () => {
    const scene = await loadScene();
    const hits = castFromViewer(scene, new Vector3(-1.06, 0.4, 0.4));
    const index = buildPartIndex(PARTS);
    assert.equal(partIdOf(pickNearest(hits, index)), "PN-FRAME-1000");
  });

  it("skips hidden meshes and returns null for an empty ray", async () => {
    const scene = await loadScene();
    const hits = castFromViewer(scene, new Vector3(1.08, 0.88, 0.62));
    const index = buildPartIndex(PARTS);
    assert.equal(hits[0]?.object.name, "PN-MTR-3301");
    hits[0].object.visible = false;
    assert.equal(partIdOf(pickNearest(hits, index)), "PN-FRAME-1000");
    assert.equal(pickNearest([], index), null);
  });
});
