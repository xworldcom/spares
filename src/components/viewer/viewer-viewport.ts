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
