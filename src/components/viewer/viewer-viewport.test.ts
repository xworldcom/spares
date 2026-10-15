import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import {
  applyOrbitSnapshot,
  fitPerspectiveToBoundsBox,
  snapshotOrbit,
  isValidOrbitSnapshot,
  syncRendererViewport,
  uprightDefaultOrbit,
} from "./viewer-viewport.ts";

describe("viewer viewport", () => {
  it("syncRendererViewport updates camera aspect from container size", () => {
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    const canvas = document.createElement("canvas");
    const gl = {
      domElement: canvas,
      setPixelRatio: () => undefined,
      setSize: (w: number, h: number) => {
        canvas.width = w;
        canvas.height = h;
      },
    };
    assert.equal(syncRendererViewport(gl as never, camera, 1280, 800, 1), true);
    assert.equal(camera.aspect, 1280 / 800);
  });

  it("syncRendererViewport applies bottom inset via setViewOffset", () => {
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    const canvas = document.createElement("canvas");
    const gl = {
      domElement: canvas,
      setPixelRatio: () => undefined,
      setSize: (w: number, h: number) => {
        canvas.width = w;
        canvas.height = h;
      },
    };
    assert.equal(syncRendererViewport(gl as never, camera, 390, 844, 1, 220), true);
    assert.ok(camera.view !== null);
    assert.ok(Math.abs(camera.aspect - 390 / 624) < 0.001);
    assert.equal(syncRendererViewport(gl as never, camera, 390, 844, 1, 0), true);
    assert.equal(camera.view, null);
    assert.equal(camera.aspect, 390 / 844);
  });

  it("uprightDefaultOrbit lifts the camera above the target", () => {
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    const target = new Vector3(0, 0, 0);
    camera.position.set(2, -3, 2);
    uprightDefaultOrbit(camera, target);
    assert.ok(camera.position.y > target.y);
  });

  it("fitPerspectiveToBoundsBox backs the camera off for narrow aspect", () => {
    const camera = new PerspectiveCamera(40, 390 / 844, 0.1, 1000);
    const target = new Vector3(0, 0, 0);
    camera.position.set(2, 1, 2);
    const wideBox = { x: 8, y: 1, z: 2 };
    const center = new Vector3(0, 0, 0);
    const size = new Vector3(wideBox.x, wideBox.y, wideBox.z);
    fitPerspectiveToBoundsBox(camera, target, size, center, 1.3);
    const dist = camera.position.distanceTo(target);
    camera.aspect = 16 / 9;
    camera.updateProjectionMatrix();
    const cameraWide = camera.clone();
    cameraWide.position.copy(camera.position);
    fitPerspectiveToBoundsBox(cameraWide, target, size, center, 1.3);
    const distWide = cameraWide.position.distanceTo(target);
    assert.ok(dist >= distWide * 0.9);
  });

  it("round-trips orbit snapshots", () => {
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(3, 2, 4);
    const target = new Vector3(1, 0, 0);
    const snap = snapshotOrbit(camera, target);
    camera.position.set(0, 0, 0);
    target.set(9, 9, 9);
    applyOrbitSnapshot(camera, target, snap);
    assert.deepEqual(snapshotOrbit(camera, target), snap);
  });
});
