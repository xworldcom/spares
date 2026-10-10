import type { PerspectiveCamera, Vector3, WebGLRenderer } from "three";

export type ViewerOrbitSnapshot = {
  position: [number, number, number];
  target: [number, number, number];
};

export function syncRendererViewport(
  gl: WebGLRenderer,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  maxDpr = 1.5,
) {
  if (width < 1 || height < 1) {
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  gl.setPixelRatio(dpr);
  gl.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

export function snapshotOrbit(
  camera: PerspectiveCamera,
  target: Vector3,
): ViewerOrbitSnapshot {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [target.x, target.y, target.z],
  };
}

export function applyOrbitSnapshot(
  camera: PerspectiveCamera,
  target: Vector3,
  snapshot: ViewerOrbitSnapshot,
) {
  camera.position.set(...snapshot.position);
  target.set(...snapshot.target);
  camera.updateProjectionMatrix();
}

/**
 * After drei Bounds.fit(), ensure the default orbit is above the target (Y-up world)
 * with a classic above-side 3/4 view instead of an inverted polar angle.
 */
export function uprightDefaultOrbit(camera: PerspectiveCamera, target: Vector3) {
  const offsetX = camera.position.x - target.x;
  const offsetY = camera.position.y - target.y;
  const offsetZ = camera.position.z - target.z;
  const horizontal = Math.hypot(offsetX, offsetZ);
  const minHeight = Math.max(horizontal * 0.35, 0.05);
  let y = offsetY;
  if (y < minHeight) {
    y = minHeight;
  }
  camera.position.set(target.x + offsetX, target.y + y, target.z + offsetZ);
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
}
