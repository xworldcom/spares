import type { Object3D } from "three";
import { resolvePick } from "./resolvePick.ts";
import type { UnmatchedMesh, ViewerPart } from "./types.ts";

export type PickHit = { part: ViewerPart } | UnmatchedMesh | null;

type RayHit = { object: Object3D; distance: number };

function isVisibleInScene(object: Object3D) {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

/**
 * Raycast hits arrive once per object along the ray. The pick is the nearest visible
 * surface only — never a part further back that the pointer is "looking through".
 */
export function pickNearest(
  intersections: readonly RayHit[],
  partsByName: Map<string, ViewerPart>,
): PickHit {
  const ordered = [...intersections].sort((a, b) => a.distance - b.distance);
  for (const hit of ordered) {
    if (!isVisibleInScene(hit.object)) {
      continue;
    }
    const resolved = resolvePick(hit.object, partsByName);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}
