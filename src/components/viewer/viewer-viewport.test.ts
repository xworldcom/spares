import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import {
  applyOrbitSnapshot,
  snapshotOrbit,
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
    syncRendererViewport(gl as never, camera, 1280, 800, 1);
    assert.equal(camera.aspect, 1280 / 800);
  });

  it("uprightDefaultOrbit lifts the camera above the target", () => {
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    const target = new Vector3(0, 0, 0);
    camera.position.set(2, -3, 2);
    uprightDefaultOrbit(camera, target);
    assert.ok(camera.position.y > target.y);
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
