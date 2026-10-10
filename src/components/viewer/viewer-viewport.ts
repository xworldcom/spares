import type { PerspectiveCamera, Vector3, WebGLRenderer } from "three";
import { Vector3 as Vector3Impl } from "three";

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
    return false;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  gl.setPixelRatio(dpr);
  gl.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  return true;
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

export function isValidOrbitSnapshot(snapshot: ViewerOrbitSnapshot): boolean {
  return [...snapshot.position, ...snapshot.target].every((value) => Number.isFinite(value));
}

export function applyOrbitSnapshot(
  camera: PerspectiveCamera,
  target: Vector3,
  snapshot: ViewerOrbitSnapshot,
) {
  if (!isValidOrbitSnapshot(snapshot)) {
    return false;
  }
  camera.position.set(...snapshot.position);
  target.set(...snapshot.target);
  camera.updateProjectionMatrix();
  return true;
}

/**
 * After drei Bounds.fit(), ensure the default orbit is above the target (Y-up world)
 * with a classic above-side 3/4 view instead of an inverted polar angle.
 */
/**
 * Fit a perspective camera to an axis-aligned bounds box using its bounding sphere
 * and the current canvas aspect (tighter wide models on narrow viewports than drei max-edge fit).
 */
export function fitPerspectiveToBoundsBox(
  camera: PerspectiveCamera,
  target: Vector3,
  boxSize: Vector3,
  boxCenter: Vector3,
  margin = 1.3,
) {
  const radius = boxSize.length() * 0.5 * margin;
  if (!Number.isFinite(radius) || radius < 1e-6) {
    return false;
  }
  const vFovRad = (camera.fov * Math.PI) / 180;
  const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * camera.aspect);
  const distV = radius / Math.sin(vFovRad / 2);
  const distH = radius / Math.sin(hFovRad / 2);
  const distance = Math.max(distV, distH);
  const center = boxCenter instanceof Vector3Impl ? boxCenter : new Vector3Impl().copy(boxCenter);
  const offset = new Vector3Impl().subVectors(camera.position, target);
  if (offset.lengthSq() < 1e-8) {
    offset.set(1, 0.75, 1);
  }
  offset.normalize().multiplyScalar(distance);
  camera.position.copy(center).add(offset);
  target.copy(center);
  camera.updateProjectionMatrix();
  return true;
}

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
