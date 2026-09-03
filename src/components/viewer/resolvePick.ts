import type { Object3D } from "three";
import type { ViewerPart } from "./types";

const IGNORED_NAMES = new Set([
  "",
  "Scene",
  "SceneRoot",
  "RootNode",
  "AuxScene",
  "Root",
]);

export function buildPartIndex(
  parts: ViewerPart[],
): Map<string, ViewerPart> {
  const index = new Map<string, ViewerPart>();
  for (const part of parts) {
    if (part.meshName) {
      index.set(part.meshName, part);
    }
    if (part.id) {
      index.set(part.id, part);
    }
  }
  return index;
}

export function resolvePick(
  object: Object3D,
  partsByName: Map<string, ViewerPart>,
): { part: ViewerPart } | { meshName: string } | null {
  let current: Object3D | null = object;
  let firstName: string | null = null;

  while (current) {
    const name = current.name?.trim();
    if (name && !IGNORED_NAMES.has(name)) {
      const part = partsByName.get(name);
      if (part) {
        return { part };
      }
      if (!firstName) {
        firstName = name;
      }
    }
    current = current.parent;
  }

  return firstName ? { meshName: firstName } : null;
}

export function meshMatchesSelection(
  object: Object3D,
  selected: ViewerPart | { meshName: string } | null,
): boolean {
  if (!selected) {
    return false;
  }
  let current: Object3D | null = object;
  while (current) {
    const name = current.name?.trim();
    if (name && !IGNORED_NAMES.has(name)) {
      if ("id" in selected) {
        if (name === selected.meshName || name === selected.id) {
          return true;
        }
      } else if (name === selected.meshName) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}
