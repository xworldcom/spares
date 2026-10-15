import { cadKey } from "./cad-name.ts";
import type { Part } from "../types/index.ts";

/** Spare line tied to a vendor STEP assembly mesh (not a separate glTF node). */
export type ManualSubPart = {
  id: string;
  name: string;
  qty: number;
  vendor?: string;
  material?: string;
  weight?: string;
  category?: string;
  replaces?: string;
  stock?: string;
};

export type ManualSubAssemblyGroup = {
  /** Stable join key (`cadKey` of parent mesh / BOM row). Survives re-upload when the mesh still exists. */
  assemblyKey: string;
  parentMeshName?: string;
  children: ManualSubPart[];
};

export function assemblyKeyForPart(part: Pick<Part, "id" | "meshName">): string {
  const raw = part.meshName?.trim() || part.id.trim();
  return cadKey(raw);
}

export function groupForPart(
  groups: readonly ManualSubAssemblyGroup[] | undefined,
  part: Pick<Part, "id" | "meshName">,
): ManualSubAssemblyGroup | undefined {
  const key = assemblyKeyForPart(part);
  return groups?.find((group) => group.assemblyKey === key);
}

/** True when `partId` exists only as a manual sub-part line (not a top-level BOM row). */
/** Parent BOM row id when `partId` is a manual sub-part line; otherwise null. */
export function manualSubPartParentPartId(
  partId: string,
  parts: readonly Part[],
  groups: readonly ManualSubAssemblyGroup[] | undefined,
): string | null {
  const normalized = partId.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  for (const group of groups ?? []) {
    for (const child of group.children) {
      if (child.id.trim().toLowerCase() === normalized) {
        const parent = parts.find(
          (part) => assemblyKeyForPart(part) === group.assemblyKey,
        );
        return parent?.id ?? null;
      }
    }
  }
  return null;
}

export function isManualOnlySubPartId(
  partId: string,
  parts: readonly Part[],
  groups: readonly ManualSubAssemblyGroup[] | undefined,
): boolean {
  const normalized = partId.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (parts.some((part) => part.id.trim().toLowerCase() === normalized)) {
    return false;
  }
  for (const group of groups ?? []) {
    for (const child of group.children) {
      if (child.id.trim().toLowerCase() === normalized) {
        return true;
      }
    }
  }
  return false;
}

export function manualChildAsPart(child: ManualSubPart, parent: Part): Part {
  return {
    id: child.id,
    name: child.name,
    meshName: parent.meshName || parent.id,
    qty: child.qty,
    ...(child.material ? { material: child.material } : {}),
    ...(child.vendor ? { vendor: child.vendor } : {}),
    ...(child.weight ? { weight: child.weight } : {}),
    ...(child.category ? { category: child.category } : {}),
    ...(child.replaces ? { replaces: child.replaces } : {}),
    ...(child.stock ? { stock: child.stock } : {}),
  };
}

function allReservedPartIds(
  parts: readonly Part[],
  groups: readonly ManualSubAssemblyGroup[] | undefined,
): Set<string> {
  const ids = new Set(parts.map((part) => part.id.trim().toLowerCase()));
  for (const group of groups ?? []) {
    for (const child of group.children) {
      ids.add(child.id.trim().toLowerCase());
    }
  }
  return ids;
}

function normalizeChildInput(raw: ManualSubPart): ManualSubPart | null {
  const id = raw.id?.trim();
  const name = raw.name?.trim();
  if (!id || !name) {
    return null;
  }
  const qty =
    typeof raw.qty === "number" && Number.isFinite(raw.qty) && raw.qty >= 1
      ? Math.floor(raw.qty)
      : 1;
  return {
    id,
    name,
    qty,
    ...(raw.vendor?.trim() ? { vendor: raw.vendor.trim() } : {}),
    ...(raw.material?.trim() ? { material: raw.material.trim() } : {}),
    ...(raw.weight?.trim() ? { weight: raw.weight.trim() } : {}),
    ...(raw.category?.trim() ? { category: raw.category.trim() } : {}),
    ...(raw.replaces?.trim() ? { replaces: raw.replaces.trim() } : {}),
    ...(raw.stock?.trim() ? { stock: raw.stock.trim() } : {}),
  };
}

function assemblyKeyStillValid(
  assemblyKey: string,
  parts: readonly Part[],
  meshNames: readonly string[],
): boolean {
  if (parts.some((part) => assemblyKeyForPart(part) === assemblyKey)) {
    return true;
  }
  return meshNames.some((mesh) => cadKey(mesh) === assemblyKey);
}

export function mergeManualSubAssembliesOnPackReplace(
  previous: readonly ManualSubAssemblyGroup[] | undefined,
  nextParts: readonly Part[],
  meshNames: readonly string[],
): ManualSubAssemblyGroup[] {
  if (!previous?.length) {
    return [];
  }
  return previous
    .filter((group) => assemblyKeyStillValid(group.assemblyKey, nextParts, meshNames))
    .map((group) => {
      const parent = nextParts.find(
        (part) => assemblyKeyForPart(part) === group.assemblyKey,
      );
      return {
        ...group,
        parentMeshName: parent?.meshName?.trim() || group.parentMeshName,
      };
    });
}

export type ManualSubPartMutation =
  | {
      baseVersion: number;
      assemblyKey: string;
      op: "add";
      child: ManualSubPart;
    }
  | {
      baseVersion: number;
      assemblyKey: string;
      op: "update";
      child: ManualSubPart;
    }
  | {
      baseVersion: number;
      assemblyKey: string;
      op: "remove";
      childId: string;
    }
  | {
      baseVersion: number;
      assemblyKey: string;
      op: "reorder";
      childIds: string[];
    };

export function parseManualSubPartMutation(
  value: unknown,
): ManualSubPartMutation | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Send a manual sub-part change" };
  }
  const body = value as Record<string, unknown>;
  const baseVersion = body.baseVersion;
  if (typeof baseVersion !== "number" || !Number.isFinite(baseVersion) || baseVersion < 1) {
    return { error: "Refresh the machine and try again" };
  }
  const assemblyKey =
    typeof body.assemblyKey === "string" ? cadKey(body.assemblyKey) : "";
  if (!assemblyKey) {
    return { error: "Choose an assembly" };
  }
  const op = body.op;
  if (op === "add" || op === "update") {
    if (!body.child || typeof body.child !== "object") {
      return { error: "Enter sub-part details" };
    }
    const child = normalizeChildInput(body.child as ManualSubPart);
    if (!child) {
      return { error: "Enter a part number and name" };
    }
    return { baseVersion: Math.floor(baseVersion), assemblyKey, op, child };
  }
  if (op === "remove") {
    const childId = typeof body.childId === "string" ? body.childId.trim() : "";
    if (!childId) {
      return { error: "Choose a sub-part to remove" };
    }
    return { baseVersion: Math.floor(baseVersion), assemblyKey, op, childId };
  }
  if (op === "reorder") {
    if (!Array.isArray(body.childIds)) {
      return { error: "Send the new sub-part order" };
    }
    const childIds = body.childIds
      .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      .map((id) => id.trim());
    return { baseVersion: Math.floor(baseVersion), assemblyKey, op, childIds };
  }
  return { error: "Unknown manual sub-part action" };
}

export function applyManualSubPartMutation(input: {
  version?: number;
  parts: Part[];
  meshNames: string[];
  manualSubAssemblies?: ManualSubAssemblyGroup[];
  mutation: ManualSubPartMutation;
}): { manualSubAssemblies: ManualSubAssemblyGroup[] } | { error: string } {
  const currentVersion = input.version ?? 1;
  if (input.mutation.baseVersion !== currentVersion) {
    return { error: "Someone else saved this machine. Refresh and try again." };
  }
  if (
    !assemblyKeyStillValid(
      input.mutation.assemblyKey,
      input.parts,
      input.meshNames,
    )
  ) {
    return { error: "That assembly is not on this machine" };
  }

  const parent = input.parts.find(
    (part) => assemblyKeyForPart(part) === input.mutation.assemblyKey,
  );
  const groups = (input.manualSubAssemblies ?? []).map((group) => ({
    ...group,
    children: [...group.children],
  }));
  let index = groups.findIndex(
    (group) => group.assemblyKey === input.mutation.assemblyKey,
  );
  if (index < 0) {
    groups.push({
      assemblyKey: input.mutation.assemblyKey,
      parentMeshName: parent?.meshName,
      children: [],
    });
    index = groups.length - 1;
  }

  const group = groups[index];
  const reserved = allReservedPartIds(input.parts, groups);

  if (input.mutation.op === "add") {
    const child = input.mutation.child;
    if (reserved.has(child.id.toLowerCase())) {
      return { error: "That part number is already on this machine" };
    }
    group.children.push(child);
  } else if (input.mutation.op === "update") {
    const child = input.mutation.child;
    const childIndex = group.children.findIndex((row) => row.id === child.id);
    if (childIndex < 0) {
      return { error: "Sub-part not found" };
    }
    const otherIds = new Set(reserved);
    otherIds.delete(child.id.toLowerCase());
    if (otherIds.has(child.id.toLowerCase())) {
      return { error: "That part number is already on this machine" };
    }
    group.children[childIndex] = child;
  } else if (input.mutation.op === "remove") {
    const childId = input.mutation.childId;
    const nextChildren = group.children.filter((row) => row.id !== childId);
    if (nextChildren.length === group.children.length) {
      return { error: "Sub-part not found" };
    }
    group.children = nextChildren;
  } else {
    const ids = input.mutation.childIds;
    const byId = new Map(group.children.map((row) => [row.id, row]));
    if (ids.length !== group.children.length) {
      return { error: "Reorder must include every sub-part" };
    }
    const reordered: ManualSubPart[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) {
        return { error: "Reorder must include every sub-part" };
      }
      reordered.push(row);
    }
    group.children = reordered;
  }

  const pruned = groups.filter((row) => row.children.length > 0);
  return { manualSubAssemblies: pruned };
}

/** Demo seed: McMaster motor assembly breakdown for hardware-fixture. */
export const HARDWARE_FIXTURE_MOTOR_SUB_PARTS: ManualSubAssemblyGroup = {
  assemblyKey: cadKey("6331K32"),
  parentMeshName: "6331K32",
  children: [
    {
      id: "6331K32-BRUSH",
      name: "Replacement brush set (pair)",
      qty: 1,
      vendor: "McMaster-Carr",
      category: "Wear kit",
    },
    {
      id: "6331K32-PINION",
      name: "Pinion gear, motor shaft",
      qty: 1,
      vendor: "McMaster-Carr",
    },
    {
      id: "6331K32-LEAD",
      name: "Motor lead wire harness",
      qty: 1,
      vendor: "McMaster-Carr",
    },
  ],
};
