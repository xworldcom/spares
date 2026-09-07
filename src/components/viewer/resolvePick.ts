import { cadKeys } from "@/lib/cad-name";
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
    for (const key of [...cadKeys(part.meshName), ...cadKeys(part.id), ...cadKeys(part.name)]) {
      if (!index.has(key)) {
        index.set(key, part);
      }
    }
    if (part.meshName) {
      index.set(part.meshName, part);
    }
    if (part.id) {
      index.set(part.id, part);
    }
  }
  return index;
}

function lookupPart(name: string, partsByName: Map<string, ViewerPart>) {
  const exact = partsByName.get(name);
  if (exact) {
    return exact;
  }
  for (const key of cadKeys(name)) {
    const part = partsByName.get(key);
    if (part) {
      return part;
    }
  }
  return undefined;
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
      const part = lookupPart(name, partsByName);
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
  const selectedKeys = new Set(
    "id" in selected
      ? [...cadKeys(selected.meshName), ...cadKeys(selected.id)]
      : cadKeys(selected.meshName),
  );
  let current: Object3D | null = object;
  while (current) {
    const name = current.name?.trim();
    if (name && !IGNORED_NAMES.has(name)) {
      if ("id" in selected && (name === selected.meshName || name === selected.id)) {
        return true;
      }
      if (!("id" in selected) && name === selected.meshName) {
        return true;
      }
      if (cadKeys(name).some((key) => selectedKeys.has(key))) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
}